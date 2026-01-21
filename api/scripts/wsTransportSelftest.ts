import WebSocket, { WebSocketServer } from 'ws'
import { WebSocketClientTransport } from '../mcp/transport/webSocketClientTransport'

async function main() {
  const wss = new WebSocketServer({ port: 0 })
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', () => resolve())
    wss.once('error', err => reject(err))
  })

  const address = wss.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get WebSocket server address')
  }
  const port = address.port

  let serverReceived: string | null = null

  wss.on('connection', socket => {
    socket.on('message', data => {
      serverReceived = typeof data === 'string' ? data : data.toString('utf-8')
    })
    socket.send('{"x":1}\n{"y":2}\n')
  })

  const ws = new WebSocket(`ws://127.0.0.1:${port}`)
  const transport = new WebSocketClientTransport(ws)

  const received: any[] = []
  transport.onmessage = msg => {
    received.push(msg)
  }

  await transport.start()
  await transport.send({ z: 3 })

  await new Promise(resolve => setTimeout(resolve, 200))

  if (received.length !== 2) {
    throw new Error(`Expected 2 inbound messages, got ${received.length}`)
  }
  if (received[0]?.x !== 1 || received[1]?.y !== 2) {
    throw new Error(`Unexpected inbound messages: ${JSON.stringify(received)}`)
  }
  if (!serverReceived || !serverReceived.endsWith('\n')) {
    throw new Error(`Expected outbound message to end with newline, got: ${JSON.stringify(serverReceived)}`)
  }

  await transport.close()
  wss.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

