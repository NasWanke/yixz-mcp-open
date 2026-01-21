import { instanceStore } from '../models/instanceStore';
import { McpRouterServer } from '../mcp/core/McpRouterServer';
import { formatLog, LogLevel } from '../mcp/utils/console';

export class InstanceManager {
  private activeServers: Map<string, McpRouterServer> = new Map();

  async initialize() {
    const instances = await instanceStore.getAll();
    for (const inst of instances) {
      if (inst.status === 'running') {
        try {
          await this.startInstance(inst.id);
        } catch (error) {
          console.error(`Failed to restore instance ${inst.id}:`, error);
          await instanceStore.update(inst.id, { status: 'error' });
        }
      }
    }
  }

  async startInstance(id: string) {
    const config = await instanceStore.get(id);
    if (!config) throw new Error('Instance not found');

    if (this.activeServers.has(id)) {
        // Already running, maybe check if it's healthy?
        return;
    }

    formatLog(LogLevel.INFO, `Starting instance: ${config.name} (${id})`);

    // 构建 McpRouterServer 所需的配置
    const serverInfo = {
        name: config.name,
        version: '1.0.0'
    };

    // 转换 nodes 为 mcpServers 配置
    const mcpServers: Record<string, any> = {};
    config.nodes.forEach(node => {
        const nodeName = this.deriveNameFromNode(node);
        mcpServers[nodeName] = {
            url: node.type === 'sse' ? node.url : undefined,
            command: node.type === 'stdio' ? node.command : undefined,
            args: node.type === 'stdio' ? node.args : undefined,
            env: node.type === 'stdio' ? node.env : undefined
        };
    });

    const routerServer = new McpRouterServer(serverInfo, {
        transportType: 'sse', // 目前我们统一对外暴露 SSE 接口
        cursorLink: false // 管理端暂时不弹 Cursor Link
    }, id); // 传入 instanceId

    // 导入配置
    // TODO: 支持 toolChains, toolsFilter 等高级配置
    await routerServer.importMcpConfig({
        mcpServers,
        namespace: '.' // 默认命名空间，符合 MCP 规范
    }, null);

    // 启动本地 stdio 服务
    await routerServer.start();

    // 如果配置了 WebSocket 接入地址 (wss://)，则尝试建立连接
    if (config.accessAddress && config.accessAddress.startsWith('wss://')) {
        routerServer.connectToRemote(config.accessAddress).catch(err => {
            console.error('Failed to initiate remote connection:', err);
        });
    }

    this.activeServers.set(id, routerServer);
    
    await instanceStore.update(id, { status: 'running' });
  }

  async stopInstance(id: string) {
    const server = this.activeServers.get(id);
    if (server) {
        await server.close();
        this.activeServers.delete(id);
    }
    await instanceStore.update(id, { status: 'stopped' });
  }

  async restartInstance(id: string) {
    await this.stopInstance(id);
    await this.startInstance(id);
  }

  getServer(id: string): McpRouterServer | undefined {
    return this.activeServers.get(id);
  }
  
  getClientForNode(instanceId: string, nodeId: string): any {
    const server = this.activeServers.get(instanceId);
    if (!server) return null;
    
    // 我们需要重新获取节点配置来计算 serverName
    // 这里为了性能，也许应该缓存 node.id -> serverName 的映射
    // 但鉴于 node 数量不多，我们可以重新读取 store
    // 异步方法无法在这里同步调用，所以我们假设调用者知道 node 对象
    // 但是 getClientForNode 的签名只接受 nodeId。
    // 既然 routes/instances.ts 里遍历了 nodes，我们可以修改 getClientForNode 签名接受 node 对象
    // 或者我们直接在这里读取 store (如果是 async 的话)
    // 但 getClientForNode 在 routes 中是同步调用的吗？
    // 检查 routes/instances.ts，它是 async handler，所以我们可以 async。
    return null; // Placeholder implementation, will be replaced
  }

  // 辅助方法：计算节点名称
  private deriveNameFromNode(node: any) {
    const preferredName = node.name && String(node.name).trim();
    if (preferredName) return preferredName;

    if (Array.isArray(node.args) && node.args.length > 0) {
        const firstNonFlag = node.args.find((a: string) => a && !a.startsWith('-'));
        if (firstNonFlag) {
            const cleaned = firstNonFlag.replace(/^@/, '').split('@')[0];
            return cleaned.replace(/[^A-Za-z0-9_.-]/g, '-');
        }
    }
    if (typeof node.command === 'string' && node.command.length > 0) {
        const base = node.command.split(/[\\/]/).pop() || node.command;
        return base.replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9_.-]/g, '-');
    }
    return `node_${node.id}`;
  }

  async getClientForNodeAsync(instanceId: string, node: any) {
      const server = this.activeServers.get(instanceId);
      if (!server) return null;
 
      try {
        const composer = server.getActiveComposer();
        const serverName = this.deriveNameFromNode(node);
        const clients = composer.listTargetClients();
        const found = clients.find(c => c.name === serverName);
        if (!found) {
            console.log(`[DEBUG] Node client not found. NodeName: ${serverName}, Available: ${clients.map(c => c.name).join(', ')}`);
        }
        return found;
      } catch (e) {
        console.error('[DEBUG] Error getting client for node:', e);
        return null;
      }
   }
}

export const instanceManager = new InstanceManager();
