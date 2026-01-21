import { Router } from 'express';
import { instanceManager } from '../services/instanceManager';

const router = Router();

// SSE Endpoint
router.get('/:instanceId/sse', async (req, res) => {
  const { instanceId } = req.params;
  const server = instanceManager.getServer(instanceId);

  if (!server) {
    res.status(404).send('Instance not found or not running');
    return;
  }

  // 构建消息 endpoint，客户端将向此地址 POST 消息
  // 假设前端代理或负载均衡器会转发 /api/mcp/:id/messages
  const messageEndpoint = `/api/mcp/${instanceId}/messages`;
  
  await server.handleSseRequest(req, res, messageEndpoint);
});

// Messages Endpoint
router.post('/:instanceId/messages', async (req, res) => {
  const { instanceId } = req.params;
  const sessionId = req.query.sessionId as string;
  const server = instanceManager.getServer(instanceId);

  if (!server) {
    res.status(404).send('Instance not found or not running');
    return;
  }

  if (!sessionId) {
    res.status(400).send('Missing sessionId parameter');
    return;
  }

  await server.handlePostMessage(sessionId, req, res);
});

export default router;
