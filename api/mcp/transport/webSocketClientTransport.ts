import WebSocket from 'ws';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export class WebSocketClientTransport implements Transport {
  private ws: WebSocket;
  private pendingInbound: any[] = [];
  private _onmessage: ((message: any) => void) | null = null;
  get onmessage() {
    return this._onmessage
  }
  set onmessage(handler: ((message: any) => void) | null) {
    this._onmessage = handler
    if (handler && this.pendingInbound.length > 0) {
      const queued = this.pendingInbound
      this.pendingInbound = []
      for (const msg of queued) {
        try {
          handler(msg)
        } catch (error) {
          if (this.onerror) this.onerror(error as Error)
        }
      }
    }
  }
  public onclose: (() => void) | null = null;
  public onerror: ((error: Error) => void) | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;
    
    this.ws.on('message', (data) => {
      const messageStr = typeof data === 'string' ? data : data.toString('utf-8');
      console.log('[WebSocketClientTransport] <<', messageStr.slice(0, 200));

      const lines = messageStr.split(/\r?\n/).filter(line => line.trim().length > 0);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (this._onmessage) {
            this._onmessage(parsed);
          } else {
            this.pendingInbound.push(parsed);
          }
        } catch (error) {
          console.error('[WebSocketClientTransport] Error parsing message line:', line.slice(0, 200));
          console.error('[WebSocketClientTransport] Error:', error);
          if (this.onerror) {
            this.onerror(error as Error);
          }
        }
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[WebSocketClientTransport] Connection closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'No reason'}`);
      if (this.onclose) {
        this.onclose();
      }
    });

    this.ws.on('error', (error) => {
      console.error('[WebSocketClientTransport] Connection error:', error);
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  async start(): Promise<void> {
    // Transport is considered started when WebSocket is open
    if (this.ws.readyState !== WebSocket.OPEN) {
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          this.ws.removeListener('error', onError);
          resolve();
        };
        const onError = (err: Error) => {
          this.ws.removeListener('open', onOpen);
          reject(err);
        };
        this.ws.once('open', onOpen);
        this.ws.once('error', onError);
      });
    }
  }

  async send(message: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not open'));
        return;
      }
      const payload = `${JSON.stringify(message)}\n`;
      console.log('[WebSocketClientTransport] >>', payload.slice(0, 200));
      this.ws.send(payload, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close();
    }
  }
}
