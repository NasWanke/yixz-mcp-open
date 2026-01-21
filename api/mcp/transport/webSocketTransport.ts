import WebSocket from 'ws';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export class WebSocketServerTransport implements Transport {
  private ws: WebSocket;
  public onmessage: ((message: any) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: ((error: Error) => void) | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  async start(): Promise<void> {
    // Transport is already started when WebSocket connection is established
  }

  async send(message: any): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
} 
