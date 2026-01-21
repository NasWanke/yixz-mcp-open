import { randomUUID } from 'node:crypto';
import { JSONRPCMessageSchema, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';

/**
 * Server transport for SSE using Express Response type.
 * Adapts the SSEServerTransport functionality to work with Express.
 */
export class ExpressSSEServerTransport {
  private _sessionId: string;
  private _sseResponse?: Response;
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  /**
   * Creates a new SSE server transport for Express.
   * @param _endpoint The endpoint where clients should POST messages
   */
  constructor(private _endpoint: string) {
    this._sessionId = randomUUID();
  }

  /**
   * Sets up the SSE connection using Express Response.
   * This method should be called to handle the initial SSE request.
   */
  handleSSERequest(res: Response): void {
    // 设置 SSE 所需的 headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // 立即发送 headers

    // 发送初始的 endpoint 事件
    res.write(`event: endpoint\ndata: ${encodeURI(this._endpoint)}?sessionId=${this._sessionId}\n\n`);

    this._sseResponse = res;

    // 处理连接关闭
    res.on('close', () => {
      this.close();
    });
  }

  /**
   * Start the SSE connection - required by McpServer
   */
  async start(): Promise<void> {
    // Express 版本中这个方法可以为空，因为连接在 handleSSERequest 中建立
  }

  /**
   * Handles incoming POST messages.
   */
  async handlePostMessage(req: Request, res: Response): Promise<void> {
    if (!this._sseResponse) {
      res.status(500).send('SSE connection not established');
      return;
    }

    try {
      const contentType = req.headers['content-type'];
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Unsupported content-type: ${contentType}`);
      }

      await this.handleMessage(req.body as JSONRPCMessage);
      res.status(202).send('Accepted');
    } catch (error) {
      this.onerror?.(error as Error);
      res.status(400).send(String(error));
    }
  }

  /**
   * Handle a client message, regardless of how it arrived.
   */
  async handleMessage(message: JSONRPCMessage) {
    try {
      const parseResult = JSONRPCMessageSchema.safeParse(message);
      if (parseResult.success) {
        this.onmessage?.(parseResult.data);
      } else {
        throw new Error(`Invalid JSON-RPC message: ${parseResult.error.message}`);
      }
    } catch (error) {
      this.onerror?.(error as Error);
      throw error;
    }
  }

  /**
   * Close the SSE connection.
   */
  async close() {
    if (this._sseResponse) {
      this._sseResponse.end();
      this._sseResponse = undefined;
      this.onclose?.();
    }
  }

  /**
   * Send a message over the SSE connection.
   */
  async send(message: JSONRPCMessage) {
    if (!this._sseResponse) {
      throw new Error('Not connected');
    }

    this._sseResponse.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
  }

  /**
   * Returns the session ID for this transport.
   */
  get sessionId(): string {
    return this._sessionId;
  }
}
