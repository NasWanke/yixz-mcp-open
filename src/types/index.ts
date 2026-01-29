export type InstanceStatus = 'running' | 'stopped' | 'error' | 'restarting';

export interface MCPNode {
  id: string;
  name?: string;
  type: 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  toolsCount: number;
  resourcesCount: number;
  promptsCount: number;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  lastHeartbeat?: string;
}

export interface Instance {
  id: string;
  name: string;
  status: InstanceStatus;
  accessAddress: string;
  nodes: MCPNode[];
  updatedAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'OUTPUT';
  category: string;
  message: string;
}
