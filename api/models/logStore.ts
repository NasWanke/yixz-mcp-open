import { LogLevel, LogCategory, addLogCallback } from '../mcp/utils/console';

interface LogEntry {
  level: LogLevel;
  category: LogCategory;
  message: string;
  timestamp: number;
  instanceId?: string;
}

const MAX_LOGS_PER_INSTANCE = 1000;

class LogStore {
  private logs: Map<string, LogEntry[]> = new Map();

  constructor() {
    addLogCallback(this.handleLog.bind(this));
  }

  private handleLog(log: LogEntry) {
    if (!log.instanceId) return;

    if (!this.logs.has(log.instanceId)) {
      this.logs.set(log.instanceId, []);
    }

    const instanceLogs = this.logs.get(log.instanceId)!;
    instanceLogs.push(log);

    // Keep only the last N logs
    if (instanceLogs.length > MAX_LOGS_PER_INSTANCE) {
      instanceLogs.shift();
    }
  }

  getLogs(instanceId: string): LogEntry[] {
    return this.logs.get(instanceId) || [];
  }

  clearLogs(instanceId: string) {
    this.logs.delete(instanceId);
  }
}

export const logStore = new LogStore();
