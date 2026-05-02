# Admin Briefing — Companion App Backend

## 1. Gateway-Token finden

**Wo:** OpenClaw Config (`openclaw config get gateway.auth.token`)  
**Auch:** In der Config-Datei unter `gateway.auth.token` oder via env var `OPENCLAW_GATEWAY_TOKEN`

```bash
openclaw config get gateway.auth.token
```

> **Hinweis:** Falls Tailscale/Remote-Zugriff konfiguriert ist, brauchst du den Token auch für die App. Lokal reicht er für die WS-Verbindung.

---

## 2. Remote-URL — Wie verbindet sich die App von außen?

**Lokal (Standard):** `ws://127.0.0.1:18789`

**Remote (Tailscale/Proxy):**
- Gateway muss auf einem **Tailscale-Exit-Node** oder mit **Tailscale serve** erreichbar sein
- URL dann: `wss://<tailscale-name>:<port>/` oder über den Tailnet-Hostname
- **Wichtig:** `wss://` (TLS) Pflicht für nicht-lokale Verbindungen; `ws://` nur für Loopback erlaubt
- **Trusted-Proxy-Mode:** `gateway.auth.mode: "trusted-proxy"` — Tailscale-Headers reichen als Auth, kein Token nötig

```
Gateway Config → gateway.bind → muss auf Tailscale-Interface hören (z.B. 127.0.0.1 + TS-Interface)
```

---

## 3. Device Identity — Wie generiert die App Keys?

Die Companion App generiert beim ersten Start ein **Ed25519-Key-Paar**:

1. App erzeugt `deviceId` (UUID) + `publicKey`/`privateKey` (Ed25519)
2. App signiert eine Challenge vom Gateway mit dem Private Key
3. `connect.params.deviceIdentity` enthält:
   - `deviceId`: eindeutige UUID
   - `publicKey`: Base64-encodeter Public Key
   - `signature`: Base64-encodete Signatur der Challenge

**Ablauf:**
```
App start → Keys generieren (persistiert) → WS verbinden → Challenge signieren → Gateway prüft → Pairing ggf. erforderlich
```

**Admin-Aufgabe:** Auf dem Gateway das Pairing genehmigen (via CLI oder anderes gepaartes Device).

---

## 4. Must-Implement Methods (3–5)

### `connect` ⭐
**Immer zuerst.** Nimmt `challenge` + `auth.token` + `deviceIdentity` entgegen. Gibt `hello` mit unterstützten Features + aktuellem `snapshot` zurück.
- Muss bei JEDER Verbindung als erstes Frame gesendet werden

### `health`
Schneller Health-Check: `{"method": "health"}` → `{"status": "ok", "uptime": ..., "version": "..."}`
- Ideal zum Testen ob Gateway erreichbar ist

### `agent` ⭐
Agent-Befehle ausführen: Input senden, Model wählen, Streaming-Events empfangen (`event:agent`, `event:run.completed`, etc.)
- Kern-Feature der Companion App

### `session.send` ⭐
Nachrichten an eine bestehende Session senden. Damit führt der User echte Konversationen.
- Braucht `session.create` zuvor oder einen bekannten `session.key`

### `tool.invoke`
Tools ausführen (Calendar, Mail, etc.). Nützlich für Kontext-Abfragen ohne Agent.

---

## 5. SDK nutzen oder selber bauen?

**Entscheidung: SDK nutzen.** ✅

**Package:** `@openclaw/sdk` (Node.js / TypeScript)

```bash
npm install @openclaw/sdk
```

**Warum SDK:**
- WebSocket-Handshake + Auth bereits eingebaut
- Token/Password-Management
- Event-Streaming sauber abstrahiert
- Namespaces: `openclaw.agents`, `openclaw.sessions`, `openclaw.tools`, `openclaw.approvals`
- Device-Auth / Pairing-Flow wird vom SDK übernommen (soweit verfügbar)

**Minimal-Example:**
```typescript
import { OpenClaw } from '@openclaw/sdk';

const openclaw = new OpenClaw({
  url: 'wss://<deine-remote-url>',
  token: 'dein-gateway-token',
});

await openclaw.connect();
await openclaw.agents.run({ input: 'Hello', model: 'anthropic/claude-sonnet-4-6' });

for await (const event of openclaw.events()) {
  console.log(event.type, event.data);
}
```

**Selber bauen** nur wenn: Nicht-Node-Plattform, ultraleicht, oder SDK nicht verfügbar. Ansonsten: SDK.

---

## Quick-Start Checklist

- [ ] Gateway-Token aus Config holen
- [ ] Gateway auf Remote-Interface erreichbar machen (Tailscale / trusted-proxy)
- [ ] Ed25519 Key-Paar generieren + persistieren (App-Seite)
- [ ] `@openclaw/sdk` installieren
- [ ] `connect` + `health` als erstes testen
- [ ] Dann `agent` + `session.send` integrieren
- [ ] Pairing auf Gateway genehmigen