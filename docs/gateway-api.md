# OpenClaw Gateway API Specification

**Repository:** https://github.com/openclaw/openclaw
**Companion App:** https://github.com/novuelias/openclaw-companion-app
**Gateway Port (default):** `18789`
**Transport:** WebSocket (text frames, JSON payloads) + HTTP REST endpoints

---

## Architecture Overview

```
┌─────────────────┐     WebSocket + HTTP (18789)     ┌──────────────┐
│  Companion App   │ ───────────────────────────────► │   Gateway    │
│  (Node/Node/iOS) │                                   │  (Daemon)    │
└─────────────────┘                                   └──────┬───────┘
                                                            │
        Channels (WhatsApp, Telegram, Signal, etc.) ◄───────┘
```

- Gateway is the single control plane per host.
- Clients connect via WebSocket on the configured bind (default `loopback:127.0.0.1:18789`).
- All clients (operators, nodes, companion apps) use the same WS API.
- One-shot HTTP endpoints also served on the same port.

---

## Connection Lifecycle

### 1. WebSocket Handshake

1. Client opens WebSocket to `ws://127.0.0.1:18789`
2. Client **MUST** send a `connect` request frame first:

```json
{
  "type": "req",
  "id": "<uuid>",
  "method": "connect",
  "params": {
    "challenge": "<nonce-from-server>",
    "auth": {
      "token": "<gateway-token>"
    },
    "clientName": "companion-app",
    "clientDisplayName": "Elias's Phone",
    "clientVersion": "1.0.0",
    "platform": "ios",
    "deviceFamily": "iphone",
    "mode": "node",
    "role": "node",
    "caps": ["canvas.*", "camera.*", "location.get", "screen.record"],
    "commands": ["canvas.*", "camera.*"],
    "permissions": { "camera.*": true, "location.get": true },
    "deviceIdentity": {
      "deviceId": "<device-uuid>",
      "publicKey": "<base64>",
      "signature": "<base64>"
    },
    "scopes": ["node", "read", "write"],
    "instanceId": "<optional-instance-id>"
  }
}
```

3. Server responds:

```json
{
  "type": "res",
  "id": "<uuid>",
  "ok": true,
  "payload": {
    "hello": {
      "features": {
        "methods": ["agent", "send", "session.create", "session.send", "health", "status", "tool.invoke", "artifacts.*"],
        "events": ["agent", "chat", "presence", "tick", "health", "heartbeat", "cron"]
      }
    },
    "snapshot": {
      "presence": { ... },
      "health": { ... }
    }
  }
}
```

**Error response (auth failed):**
```json
{
  "type": "res",
  "id": "<uuid>",
  "ok": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid token",
    "retryable": true,
    "retryAfterMs": 5000
  }
}
```

### 2. After Connected — Server Pushes

After successful connect, the gateway immediately emits:
- `event:presence` — current presence state
- `event:tick` — periodic health tick

---

## Auth Flows

### Token Auth (default)
- `connect.params.auth.token` — static token from `gateway.auth.token` config
- `connect.params.auth.password` — alternative password from `gateway.auth.password`

### Device Auth (nodes)
- Device identity signed with private key
- Server issues a **device token** on first successful pairing
- Subsequent connects use `deviceToken` instead of static token

### Trusted Proxy Auth
- `gateway.auth.mode: "trusted-proxy"` — auth satisfied from reverse-proxy headers (Tailscale, etc.)

### Auth Resolution Order (for requests)
1. `OPENCLAW_LIVE_<PROVIDER>_KEY`
2. `<PROVIDER>_API_KEYS`
3. `<PROVIDER>_API_KEY`
4. `<PROVIDER>_API_KEY_*`

---

## RPC Request/Response Frames

All requests after handshake:
```json
// Request
{
  "type": "req",
  "id": "<uuid>",
  "method": "<method-name>",
  "params": { ... }
}

// Response
{
  "type": "res",
  "id": "<uuid>",
  "ok": true,
  "payload": { ... }
}

// Error
{
  "type": "res",
  "id": "<uuid>",
  "ok": false,
  "error": {
    "code": "<ERROR_CODE>",
    "message": "Human readable",
    "details": { ... },
    "retryable": false,
    "retryAfterMs": 5000
  }
}
```

## Server Push / Event Frames

```json
{
  "type": "event",
  "event": "<event-name>",
  "payload": { ... },
  "seq": 123,
  "stateVersion": 456
}
```

---

## Key Endpoints / Methods

### `connect` — Establish Session
- **Type:** RPC request (first frame only)
- **Auth:** Token, password, or device token
- **Params:** See handshake above

### `health` — Gateway Health Check
```json
{
  "type": "req",
  "id": "health-1",
  "method": "health",
  "params": {}
}
```
Response:
```json
{
  "type": "res",
  "id": "health-1",
  "ok": true,
  "payload": {
    "status": "ok",
    "uptime": 3600,
    "version": "1.x.x"
  }
}
```

### `status` — Full System Status
```json
{
  "type": "req",
  "id": "status-1",
  "method": "status",
  "params": {}
}
```

### `agent` — Run an Agent Command
```json
{
  "type": "req",
  "id": "agent-1",
  "method": "agent",
  "params": {
    "input": "What's on my calendar today?",
    "agentId": "main",
    "model": "anthropic/claude-sonnet-4-6",
    "thinking": "high",
    "sessionId": "optional-session-id",
    "sessionKey": "optional-key",
    "attachments": [],
    "timeout": 300,
    "idempotencyKey": "<uuid>"
  }
}
```
Response (immediate):
```json
{
  "type": "res",
  "id": "agent-1",
  "ok": true,
  "payload": {
    "runId": "run-abc123",
    "status": "accepted"
  }
}
```
Then server pushes streaming events:
- `event:agent` — delta chunks
- `event:run.completed` / `event:run.failed` — final

### `send` — Send a Message
```json
{
  "type": "req",
  "id": "send-1",
  "method": "send",
  "params": {
    "target": "+4917656023201",
    "message": "Hello from the companion!",
    "idempotencyKey": "<uuid>"
  }
}
```

### `session.create` — Create a Session
```json
{
  "type": "req",
  "id": "sess-1",
  "method": "session.create",
  "params": {
    "key": "my-session-key",
    "agentId": "main",
    "label": "Companion Chat",
    "model": "anthropic/claude-sonnet-4-6",
    "parentSessionKey": "optional-parent",
    "task": "optional-task-description",
    "message": "initial message"
  }
}
```

### `session.send` — Send to Session
```json
{
  "type": "req",
  "id": "sess-send-1",
  "method": "session.send",
  "params": {
    "key": "my-session-key",
    "message": "Follow-up message",
    "thinking": "medium",
    "attachments": [],
    "timeoutMs": 30000,
    "idempotencyKey": "<uuid>"
  }
}
```

### `session.list` — List Sessions
```json
{
  "type": "req",
  "id": "sess-list-1",
  "method": "session.list",
  "params": {}
}
```

### `tool.invoke` — Invoke a Tool
```json
{
  "type": "req",
  "id": "tool-1",
  "method": "tool.invoke",
  "params": {
    "toolName": "gog",
    "args": { "command": "calendar list" },
    "sessionKey": "optional-session-key",
    "agentId": "optional-agent",
    "confirm": false,
    "idempotencyKey": "<uuid>"
  }
}
```
Response:
```json
{
  "type": "res",
  "id": "tool-1",
  "ok": true,
  "payload": {
    "ok": true,
    "toolName": "gog",
    "output": { ... },
    "requiresApproval": false
  }
}
```

### `artifacts.list` — List Artifacts
```json
{
  "type": "req",
  "id": "art-list-1",
  "method": "artifacts.list",
  "params": {
    "sessionKey": "my-session-key",
    "runId": "run-abc123"
  }
}
```

### `artifacts.get` — Get Artifact
```json
{
  "type": "req",
  "id": "art-get-1",
  "method": "artifacts.get",
  "params": {
    "sessionKey": "my-session-key",
    "runId": "run-abc123",
    "taskId": "optional-task-id"
  }
}
```

### `artifacts.download` — Download Artifact
```json
{
  "type": "req",
  "id": "art-dl-1",
  "method": "artifacts.download",
  "params": {
    "sessionKey": "my-session-key",
    "runId": "run-abc123"
  }
}
```

### `approval.resolve` — Resolve an Approval Request
```json
{
  "type": "req",
  "id": "approval-1",
  "method": "approval.resolve",
  "params": {
    "approvalId": "approval-xyz",
    "approved": true,
    "reason": "Approved by user via companion app"
  }
}
```

### `models.status` — Model Auth Status
```json
{
  "type": "req",
  "id": "models-1",
  "method": "models.status",
  "params": {}
}
```

---

## OpenAI-Compatible REST Endpoints (HTTP)

These run on the **same port** as the WebSocket gateway:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/models` | List available models |
| `GET` | `/v1/models/{id}` | Get specific model |
| `POST` | `/v1/embeddings` | Create embeddings |
| `POST` | `/v1/chat/completions` | Chat completions (OpenAI compat) |
| `POST` | `/v1/responses` | Agent-native responses |
| `POST` | `/tools/invoke` | Tool invocation |

---

## Events (Server → Client Push)

### `event:agent` / `event:run.*`
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-abc123",
    "type": "delta",
    "delta": { "text": "Hello" }
  },
  "seq": 1
}
```

### Event Types

| Event | Description |
|-------|-------------|
| `run.created` | Run was created |
| `run.queued` | Run is queued |
| `run.started` | Run started execution |
| `run.completed` | Run finished successfully |
| `run.failed` | Run failed |
| `run.cancelled` | Run was cancelled |
| `run.timed_out` | Run timed out |
| `assistant.delta` | Streaming text delta |
| `assistant.message` | Complete assistant message |
| `thinking.delta` | Thinking text delta |
| `tool.call.started` | Tool call began |
| `tool.call.delta` | Tool call streaming output |
| `tool.call.completed` | Tool call finished |
| `tool.call.failed` | Tool call failed |
| `approval.requested` | Approval needed |
| `approval.resolved` | Approval resolved |
| `question.requested` | Question asked |
| `question.answered` | Question answered |
| `artifact.created` | Artifact created |
| `artifact.updated` | Artifact updated |
| `session.created` | Session created |
| `session.updated` | Session updated |
| `session.compacted` | Session compacted |
| `task.updated` | Task updated |
| `git.branch` | Git branch event |
| `git.diff` | Git diff event |
| `git.pr` | Git PR event |
| `raw` | Raw gateway event (chat projections) |
| `presence` | Presence update |
| `tick` | Periodic health tick |
| `health` | Health status change |
| `heartbeat` | Heartbeat event |
| `cron` | Cron event |
| `shutdown` | Gateway shutting down |

---

## SDK Client (Node.js / TypeScript)

**Package:** `@openclaw/sdk` (in `packages/sdk`)

### Installation
```bash
npm install @openclaw/sdk
```

### Usage
```typescript
import { OpenClaw } from '@openclaw/sdk';

const openclaw = new OpenClaw({
  url: 'ws://127.0.0.1:18789',
  token: 'your-gateway-token',
  password: 'optional-password'
});

// Connect
await openclaw.connect();

// Run agent
const result = await openclaw.agents.run({
  input: 'What is the weather?',
  model: 'anthropic/claude-sonnet-4-6',
});

// Or stream events
for await (const event of openclaw.runEvents(result.runId)) {
  console.log(event.type, event.data);
}

// Send message
await openclaw.sessions.send({
  key: 'my-session',
  message: 'Hello',
});

// Tool invocation
const toolResult = await openclaw.tools.invoke({
  toolName: 'gog',
  args: { command: 'calendar list' },
});

// Listen to all events
for await (const event of openclaw.events()) {
  console.log(event.type, event.data);
}

await openclaw.close();
```

### Namespaces
- `openclaw.agents` — Run agents, manage agent runs
- `openclaw.sessions` — Create/send/list sessions
- `openclaw.runs` — Manage runs
- `openclaw.tasks` — Task operations
- `openclaw.models` — Model status/config
- `openclaw.tools` — Tool invocation
- `openclaw.artifacts` — Artifact list/get/download
- `openclaw.approvals` — Approval resolution
- `openclaw.environments` — Environment management

---

## Plugin SDK

**Package:** `@openclaw/plugin-sdk` (in `packages/plugin-sdk`)
**Contract:** `@openclaw/plugin-package-contract`

Plugins are npm packages with `openclaw.compat.pluginApi` and `openclaw.build.openclawVersion` fields in `package.json`.

### Plugin package.json example
```json
{
  "name": "openclaw-plugin-example",
  "version": "1.0.0",
  "openclaw": {
    "compat": {
      "pluginApi": "1"
    },
    "build": {
      "openclawVersion": "1.x.x"
    }
  }
}
```

---

## Companion App Connection Flow

1. App generates device identity (public/private key pair)
2. App opens WS to gateway
3. Sends `connect` with `role: "node"`, device identity, and required caps
4. If device not paired → gateway returns auth error with pairing challenge
5. User approves pairing (via gateway CLI or another paired device)
6. App re-connects with device token → success
7. App can now call `agent`, `session.send`, `tool.invoke`, etc.
8. App receives events (`tick`, `agent`, `presence`, etc.) as server pushes

---

## Security Notes

- `ws://` only allowed for loopback addresses. Remote connections MUST use `wss://`.
- All WebSocket clients must send `connect` as first frame.
- Device tokens are cached; cleared on `device token mismatch` close code 1008.
- Nonce signing is required for all connections.
- Gateway auth applies to ALL connections (local and remote).

---

## References

- Main repo: https://github.com/openclaw/openclaw
- Docs: https://docs.openclaw.ai
- Gateway Protocol: https://docs.openclaw.ai/gateway/protocol
- Authentication: https://docs.openclaw.ai/gateway/authentication
- Configuration: https://docs.openclaw.ai/gateway/configuration
- Architecture: https://docs.openclaw.ai/concepts/architecture
- Security: https://docs.openclaw.ai/gateway/security