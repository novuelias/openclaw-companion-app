// Connection Service - manages gateway connection with device identity
// Handles device pairing, token storage, and reconnection

import { v4 as uuidv4 } from 'uuid';
import { GatewayService } from './gateway';

// Device identity stored in SecureStorage (React Native Keychain/AsyncStorage)
// For development, we use a simple in-memory store

interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
  deviceToken?: string; // Received after successful pairing
}

interface StoredCredentials {
  gatewayUrl: string;
  operatorToken: string;
  deviceIdentity: DeviceIdentity;
}

class ConnectionService {
  private gateway: GatewayService | null = null;
  private credentials: StoredCredentials | null = null;
  private isConnecting = false;
  private listeners: Set<{ event: string; handler: (...args: unknown[]) => void }> = new Set();

  // Initialize with operator token and gateway URL
  async initialize(config: {
    gatewayUrl: string;
    operatorToken: string;
  }): Promise<void> {
    this.credentials = {
      gatewayUrl: config.gatewayUrl,
      operatorToken: config.operatorToken,
      deviceIdentity: {
        deviceId: 'companion-' + uuidv4().substring(0, 8),
        publicKey: '', // Will be generated on first connect
        privateKey: '', // Will be generated on first connect
      },
    };
  }

  // Generate or load device identity
  private async ensureDeviceIdentity(): Promise<DeviceIdentity> {
    if (!this.credentials) {
      throw new Error('ConnectionService not initialized');
    }

    const identity = this.credentials.deviceIdentity;

    // If no keys exist, generate a new key pair
    // In production, use react-native-keychain for secure storage
    if (!identity.publicKey || !identity.privateKey) {
      // For now, we generate placeholder keys
      // In production: use crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
      identity.publicKey = 'PLACEHOLDER_PUBLIC_KEY';
      identity.privateKey = 'PLACEHOLDER_PRIVATE_KEY';
    }

    return identity;
  }

  // Connect to the gateway
  async connect(): Promise<void> {
    if (!this.credentials) {
      throw new Error('ConnectionService not initialized. Call initialize() first.');
    }

    if (this.isConnecting || (this.gateway?.isConnected())) {
      return;
    }

    this.isConnecting = true;

    try {
      const identity = await this.ensureDeviceIdentity();

      this.gateway = new GatewayService({
        url: this.credentials.gatewayUrl,
        token: identity.deviceToken || this.credentials.operatorToken,
        deviceId: identity.deviceId,
        devicePublicKey: identity.publicKey,
        devicePrivateKey: identity.privateKey,
        clientDisplayName: 'OpenClaw Companion',
        clientVersion: '1.0.0',
        platform: 'ios',
      });

      // Forward events from gateway
      this.gateway.on('connected', () => this.emit('connected'));
      this.gateway.on('disconnected', () => this.emit('disconnected'));
      this.gateway.on('error', (e: unknown) => this.emit('error', e));
      this.gateway.on('event', (e: { event: string; payload: unknown }) => this.emit('event', e));

      // Listen for specific events
      this.gateway.on('tick', (payload: unknown) => this.emit('tick', payload));
      this.gateway.on('presence', (payload: unknown) => this.emit('presence', payload));
      this.gateway.on('agent', (payload: unknown) => this.emit('agent', payload));
      this.gateway.on('approval.requested', (payload: unknown) => this.emit('approval:requested', payload));

      await this.gateway.connect();
    } finally {
      this.isConnecting = false;
    }
  }

  // Disconnect from gateway
  async disconnect(): Promise<void> {
    if (this.gateway) {
      await this.gateway.close();
      this.gateway = null;
    }
  }

  // Check connection status
  isConnected(): boolean {
    return this.gateway?.isConnected() ?? false;
  }

  // Health check
  async health(): Promise<{ status: string; uptime: number; version: string }> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.health();
  }

  // Full status
  async status(): Promise<unknown> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.status();
  }

  // Send a message
  async sendMessage(target: string, message: string): Promise<unknown> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.send(target, message);
  }

  // Agent command
  async agent(input: string, options?: { model?: string; sessionId?: string }): Promise<{ runId: string }> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.agent(input, options);
  }

  // Session operations
  async sessionCreate(key: string, label?: string): Promise<unknown> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.sessionCreate(key, label);
  }

  async sessionSend(key: string, message: string): Promise<unknown> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.sessionSend(key, message);
  }

  async sessionList(): Promise<unknown> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.sessionList();
  }

  // Tool invocation
  async toolInvoke(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.toolInvoke(toolName, args);
  }

  // Approval resolution
  async resolveApproval(approvalId: string, approved: boolean, reason?: string): Promise<unknown> {
    if (!this.gateway) throw new Error('Not connected');
    return this.gateway.approvalResolve(approvalId, approved, reason);
  }

  // Event forwarding
  private emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners) {
      if (listener.event === event) {
        listener.handler(...args);
      }
    }
  }

  on(event: string, handler: (...args: unknown[]) => void): () => void {
    const listener = { event, handler };
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    for (const listener of [...this.listeners]) {
      if (listener.event === event && listener.handler === handler) {
        this.listeners.delete(listener);
      }
    }
  }
}

export const connectionService = new ConnectionService();
export default connectionService;
