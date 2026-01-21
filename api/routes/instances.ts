import { Router } from 'express';
import { instanceStore } from '../models/instanceStore';
import { instanceManager } from '../services/instanceManager';
import { logStore } from '../models/logStore';
import { randomUUID } from 'crypto';

const router = Router();

// Get all instances
router.get('/', async (req, res) => {
  const instances = await instanceStore.getAll();
  // TODO: 这里可以合并实时状态（如 running/stopped），目前先返回配置状态
  // 实际上 instanceManager.startInstance 更新了 store，所以状态应该是准的
  res.json(instances);
});

// Get instance nodes status
router.get('/:id/nodes', async (req, res) => {
  const { id } = req.params;
  const server = instanceManager.getServer(id);
  const instance = await instanceStore.get(id);

  if (!instance) {
    res.status(404).json({ error: 'Instance not found' });
    return;
  }

  if (!server || instance.status !== 'running') {
    // 实例未运行，返回配置中的静态节点信息，状态为 disconnected
    const nodes = instance.nodes.map(node => ({
      id: node.id || randomUUID(), // 确保有ID
      name: (node as any).name,
      type: node.type,
      url: node.url,
      command: node.command,
      status: 'disconnected',
      toolsCount: 0,
      resourcesCount: 0,
      promptsCount: 0,
      lastHeartbeat: '-'
    }));
    res.json(nodes);
    return;
  }

  try {
    // 映射配置节点到实时状态
    const nodes = await Promise.all(instance.nodes.map(async (node) => {
      // 检查运行状态
      const activeClient = await instanceManager.getClientForNodeAsync(id, node);

      if (activeClient) {
        return {
          id: node.id,
          name: (node as any).name,
          type: node.type,
          url: node.url,
          command: node.command,
          args: node.args, // 补全 args
          env: node.env,   // 补全 env
          status: 'connected', // activeClients 中存在的即为已连接
          toolsCount: (activeClient as any).toolsCount || 0,
          resourcesCount: 0,
          promptsCount: 0,
          lastHeartbeat: new Date().toISOString()
        };
      } else {
         return {
          id: node.id,
          name: (node as any).name,
          type: node.type,
          url: node.url,
          command: node.command,
          args: node.args, // 补全 args
          env: node.env,   // 补全 env
          status: 'error', // 运行时未找到，可能是连接失败
          toolsCount: 0,
          resourcesCount: 0,
          promptsCount: 0,
          lastHeartbeat: '-'
        };
      }
    }));
    
    res.json(nodes);
  } catch (error) {
    console.error('Failed to get nodes:', error);
    res.status(500).json({ error: 'Failed to get nodes status' });
  }
});

// Get instance logs
router.get('/:id/logs', async (req, res) => {
  const { id } = req.params;
  const logs = logStore.getLogs(id);
  res.json(logs);
});

// Get instance tools
router.get('/:id/tools', async (req, res) => {
  const { id } = req.params;
  const server = instanceManager.getServer(id);
  
  if (!server) {
    res.json([]); // Instance not running or not found
    return;
  }

  try {
    const composer = server.getActiveComposer();
    const tools = await composer.listTools();
    res.json(tools);
  } catch (error) {
    console.error('Failed to get tools:', error);
    res.status(500).json({ error: 'Failed to get tools' });
  }
});

// Create instance
router.post('/', async (req, res) => {
  const config = req.body;
  // TODO: Validate config using zod
  const id = randomUUID();
  
  // 自动生成 accessAddress
  // 实际上这里应该配置外部访问域名，这里先用 placeholder 或基于请求头的
  // 注意：mcp_server_exe 默认生成的 token 逻辑这里简化了，直接用 SSE URL
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  // 优先使用用户提供的 accessAddress，否则生成默认 SSE 地址
  const accessAddress = config.accessAddress || `${protocol}://${host}/api/mcp/${id}/sse`;

  const newInstance = await instanceStore.add({
    ...config,
    id,
    accessAddress,
    status: 'stopped',
    nodes: config.nodes || []
  });
  
  res.status(201).json(newInstance);
});

// Get instance details
router.get('/:id', async (req, res) => {
  const instance = await instanceStore.get(req.params.id);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  res.json(instance);
});

// Update instance
router.put('/:id', async (req, res) => {
  const instance = await instanceStore.update(req.params.id, req.body);
  if (!instance) return res.status(404).json({ error: 'Instance not found' });
  
  // 如果正在运行，且配置变更影响了运行时（如节点变更），可能需要重启
  // 目前简单处理：只更新配置，不自动重启
  res.json(instance);
});

// Delete instance
router.delete('/:id', async (req, res) => {
  await instanceManager.stopInstance(req.params.id);
  const deleted = await instanceStore.delete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Instance not found' });
  res.status(204).send();
});

// Start instance
router.post('/:id/start', async (req, res) => {
  try {
    await instanceManager.startInstance(req.params.id);
    res.json({ status: 'running' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Stop instance
router.post('/:id/stop', async (req, res) => {
  try {
    await instanceManager.stopInstance(req.params.id);
    res.json({ status: 'stopped' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Restart instance
router.post('/:id/restart', async (req, res) => {
  try {
    await instanceManager.restartInstance(req.params.id);
    res.json({ status: 'running' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
