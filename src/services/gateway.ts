// Gateway Service - WebSocket connection to OpenClaw Gateway
// Implements the Gateway API protocol directly (no SDK dependency needed)

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// Frame types
interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
    retryAfterMs?: number;
  };
}

interface EventFrame {
  type: 'event';
  event: string;
  payload: unknown;
  seq?: number;
  stateVersion?: number;
}

type Frame = RequestFrame | ResponseFrame | EventFrame;

export interface GatewayConfig {
  url: string;
  token: string;
  deviceId: string;
  devicePublicKey: string;
  devicePrivateKey: string;
  clientName?: string;
  clientDisplayName?: string;
  clientVersion?: string;
  platform?: 'ios' | 'android';
  deviceFamily?: string;
}

interface ConnectParams {
  challenge?: string;
  auth: { token: string; password?: string };
  clientName: string;
  clientDisplayName: string;
  clientVersion: string;
  platform: string;
  deviceFamily: string;
  mode: string;
  role: string;
  caps: string[];
  commands: string[];
  permissions: Record<string, boolean>;
  deviceIdentity: {
    deviceId: string;
    publicKey: string;
    signature: string;
  };
  scopes: string[];
}

export class GatewayService extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private pendingRequests: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }> = new Map();
  private seq = 0;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(config: GatewayConfig) {
    super();
    this.config = config;
  }

  private getSignature(data: string, privateKey: string): string {
    // For device auth, we use the private key to sign the data
    // In a real implementation, this would use Node.js crypto
    // For now, we use a placeholder - real implementation would use ECDSA
    try {
      const crypto = require('crypto');
      const sign = crypto.createSign('SHA256');
      sign.update(data);
      sign.end();
      return sign.sign(privateKey, 'base64');
    } catch {
      // Fallback for browser environments
      return btoa(data);
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          // Send connect request as first frame
          const connectParams: ConnectParams = {
            auth: { token: this.config.token },
            clientName: this.config.clientName || 'companion-app',
            clientDisplayName: this.config.clientDisplayName || 'Companion App',
            clientVersion: this.config.clientVersion || '1.0.0',
            platform: this.config.platform || 'ios',
            deviceFamily: this.config.deviceFamily || 'iphone',
            mode: 'node',
            role: 'node',
            caps: ['canvas.*', 'camera.*', 'location.get', 'screen.record'],
            commands: ['canvas.*', 'camera.*'],
            permissions: { 'camera.*': true, 'location.get': true },
            deviceIdentity: {
              deviceId: this.config.deviceId,
              publicKey: this.config.devicePublicKey,
              signature: this.getSignature(this.config.deviceId, this.config.devicePrivateKey),
            },
            scopes: ['node', 'read', 'write'],
          };

          const frame: RequestFrame = {
            type: 'req',
            id: uuidv4(),
            method: 'connect',
            params: connectParams as unknown as Record<string, unknown>,
          };

          this.sendFrame(frame);

          // Set up handlers for connect response
          const connectHandler = (frame: Frame) => {
            if (frame.type === 'res' && frame.id === frame.id) {
              if (frame.ok) {
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
                resolve();
              } else {
                reject(new Error(`Connection failed: ${frame.error?.message}`));
              }
              // Remove this temp handler
              this.off('frame', connectHandler);
            }
          };

          this.on('frame', connectHandler);

          // Timeout after 10 seconds
          setTimeout(() => {
            this.off('frame', connectHandler);
            reject(new Error('Connection timeout'));
          }, 10000);
        };

        this.ws.onmessage = (event) => {
          try {
            const frame: Frame = JSON.parse(event.data);
            this.handleFrame(frame);
          } catch (e) {
            console.error('Failed to parse frame:', e);
          }
        };

        this.ws.onerror = (error) => {
          this.emit('error', error);
          reject(new Error('WebSocket error'));
        };

        this.ws.onclose = (event) => {
          this.connected = false;
          this.emit('disconnected', event);
          this.scheduleReconnect();
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect-failed');
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }

  private handleFrame(frame: Frame): void {
    this.emit('frame', frame);

    if (frame.type === 'event') {
      this.emit(frame.event, frame.payload);
      this.emit('event', { event: frame.event, payload: frame.payload });
    } else if (frame.type === 'res') {
      const pending = this.pendingRequests.get(frame.id);
      if (pending) {
        this.pendingRequests.delete(frame.id);
        if (frame.ok) {
          pending.resolve(frame.payload);
        } else {
          pending.reject(new Error(frame.error?.message || 'Request failed'));
        }
      }
    }
  }

  private sendFrame(frame: RequestFrame): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.connected) {
      throw new Error('Not connected to gateway');
    }

    const id = uuidv4();
    const frame: RequestFrame = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.sendFrame(frame);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  async health(): Promise<{ status: string; uptime: number; version: string }> {
    return this.request('health') as Promise<{ status: string; uptime: number; version: string }>;
  }

  async status(): Promise<unknown> {
    return this.request('status');
  }

  async agent(input: string, options?: { model?: string; sessionId?: string; timeout?: number }): Promise<{ runId: string }> {
    return this.request('agent', {
      input,
      agentId: 'main',
      model: options?.model || 'anthropic/claude-sonnet-4-6',
      sessionId: options?.sessionId,
      timeout: options?.timeout || 300,
      idempotencyKey: uuidv4(),
    }) as Promise<{ runId: string }>;
  }

  async send(target: string, message: string, idempotencyKey?: string): Promise<unknown> {
    return this.request('send', { target, message, idempotencyKey: idempotencyKey || uuidv4() });
  }

  async sessionCreate(key: string, label?: string, model?: string): Promise<unknown> {
    return this.request('session.create', { key, label, agentId: 'main', model });
  }

  async sessionSend(key: string, message: string, timeoutMs?: number): Promise<unknown> {
    return this.request('session.send', { key, message, timeoutMs: timeoutMs || 30000 });
  }

  async sessionList(): Promise<unknown> {
    return this.request('session.list');
  }

  async toolInvoke(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request('tool.invoke', { toolName, args, confirm: false });
  }

  async approvalResolve(approvalId: string, approved: boolean, reason?: string): Promise<unknown> {
    return this.request('approval.resolve', { approvalId, approved, reason });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

export default GatewayService;
