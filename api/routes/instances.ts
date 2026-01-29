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
    // 获取 composer 中的所有客户端状态
    const composer = server.getActiveComposer();
    const clientList = composer.listTargetClients();

    // 创建客户端名称到状态的映射
    const clientStatusMap = new Map<string, any>();
    for (const client of clientList) {
      clientStatusMap.set(client.name, client);
    }

    // 映射配置节点到实时状态
    const nodes = await Promise.all(instance.nodes.map(async (node) => {
      const nodeName = instanceManager.deriveNameFromNode(node);
      const clientStatus = clientStatusMap.get(nodeName);

      if (clientStatus) {
        // 使用 composer 返回的实际状态
        return {
          id: node.id,
          name: (node as any).name,
          type: node.type,
          url: node.url,
          command: node.command,
          args: node.args,
          env: node.env,
          status: clientStatus.status, // 使用 composer 的实际状态: 'connecting', 'connected', 'error'
          toolsCount: clientStatus.toolsCount || 0,
          resourcesCount: 0,
          promptsCount: 0,
          lastHeartbeat: new Date().toISOString()
        };
      } else {
        // 节点不在 composer 中，说明未连接或配置有问题
        return {
          id: node.id,
          name: (node as any).name,
          type: node.type,
          url: node.url,
          command: node.command,
          args: node.args,
          env: node.env,
          status: 'error',
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
  const { level } = req.query;
  const logs = logStore.getLogs(id, level as any);
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

  // 如果节点配置发生变化且实例正在运行，通过 WebSocket 通知远程服务器节点更新
  const isNodesChanged = req.body.nodes !== undefined;
  const wasRunning = instance.status === 'running';

  if (isNodesChanged && wasRunning) {
    // 节点变化时通知远程服务器（通过 accessAddress WebSocket 连接）
    // 不要 await，让它在后台执行，但需要等待一小段时间让状态更新开始
    instanceManager.updateNodes(req.params.id, instance.nodes).catch(error => {
      console.error('Failed to notify nodes update:', error);
      // 即使通知失败，配置也已更新
    });

    // 等待一小段时间让 updateNodes 开始执行并标记节点状态
    await new Promise(resolve => setTimeout(resolve, 100));
  }

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
