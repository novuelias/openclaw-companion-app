// API Types for OpenClaw Companion App

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: 'ios' | 'android';
  appVersion: string;
  fcmToken?: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'high' | 'normal';
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Gateway connection types
export interface GatewayCredentials {
  url: string;
  token: string;
  deviceId: string;
  publicKey: string;
  privateKey: string;
}

export interface AgentResult {
  runId: string;
  status: 'accepted' | 'completed' | 'failed';
}

export interface SessionInfo {
  key: string;
  label?: string;
  agentId: string;
  createdAt: number;
}

export interface ToolInvokeResult {
  ok: boolean;
  toolName: string;
  output: unknown;
  requiresApproval: boolean;
}
