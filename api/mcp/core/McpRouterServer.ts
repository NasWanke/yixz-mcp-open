import type { Implementation } from '@modelcontextprotocol/sdk/types.js'
import { McpServerComposer } from './serverComposer'
import { ExpressSSEServerTransport } from '../transport/expressSseTransport'
import { WebSocketClientTransport } from '../transport/webSocketClientTransport'
import WebSocket from 'ws'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { McpServerType } from '../utils/schemas'
import { formatLog, LogCategory, LogLevel } from '../utils/console'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { fieldsToZodSchema } from '../utils/xToZodSchema'
import type { Request, Response } from 'express'

const NAMESPACE_SEPARATOR = '.'

export class McpRouterServer {
  private readonly transportType: 'sse' | 'stdio'
  private readonly baseServerInfo: Implementation
  private parsedConfig: {
    targetServers: McpServerType[]
    toolChains: any[]
    toolsFilter: string[]
    namespace: string
    configureMcp: Function | null
  } | null = null

  private readonly sseSessions: Map<
    string,
    {
      composer: McpServerComposer
      server: McpServer
      transport: ExpressSSEServerTransport
    }
  > = new Map()

  private stdioComposer: McpServerComposer | null = null
  private stdioServer: McpServer | null = null
  private stdioTransport: StdioServerTransport | null = null

  // 添加默认SSE服务器实例，用于WebSocket等场景
  private defaultSseComposer: McpServerComposer | null = null
  private defaultSseServer: McpServer | null = null

  constructor(
    serverInfo: Implementation,
    private readonly serverOptions: {
      transportType?: 'sse' | 'stdio'
      cursorLink?: boolean
    },
    private instanceId?: string // 添加 instanceId 参数
  ) {
    this.baseServerInfo = serverInfo
    this.transportType = serverOptions.transportType ?? 'sse'

    // 初始化默认服务器实例
    if (this.transportType === 'sse') {
      this.initSseServer()
    } else if (this.transportType === 'stdio') {
      this.initStdioServer()
    }
  }

  initSseServer() {
    this.defaultSseComposer = new McpServerComposer(this.baseServerInfo, this.instanceId)
    this.defaultSseServer = this.defaultSseComposer.server
  }

  initStdioServer() {
    this.stdioComposer = new McpServerComposer(this.baseServerInfo, this.instanceId)
    this.stdioServer = this.stdioComposer.server
    this.stdioTransport = new StdioServerTransport()
  }

  // 存储远程连接引用
  private remoteConnections: Array<{ server: McpServer, transport: WebSocketClientTransport, composer: McpServerComposer, url: string }> = [];

  async connectToRemote(url: string) {
    const connect = async () => {
      try {
        formatLog(LogLevel.INFO, `Connecting to remote WebSocket: ${url}`, LogCategory.CONNECTION, false, this.instanceId)
        
        const ws = new WebSocket(url);
        const transport = new WebSocketClientTransport(ws);
        
        // 我们每次重连都使用一个新的 Server 实例，以避免状态污染
        const composer = new McpServerComposer(this.baseServerInfo, this.instanceId)
        const server = composer.server

        await transport.start()

        // 注意：McpServer 在 connect(transport) 之后不允许再注册 capabilities（tools/resources/prompts）
        // 所以必须先应用配置（注册工具等），再 connect。
        if (this.parsedConfig) {
          await this._applyConfigurationToComposer(
            composer,
            server,
            this.parsedConfig.configureMcp
          )
        }

        await server.connect(transport)
        
        // 监听 Transport 关闭事件以触发重连
        const originalOnClose = transport.onclose
        transport.onclose = () => {
          formatLog(LogLevel.WARN, `Remote WebSocket closed. Reconnecting in 5s...`, LogCategory.CONNECTION, false, this.instanceId);
          if (originalOnClose) originalOnClose.call(transport);
          
          const idx = this.remoteConnections.findIndex(c => c.transport === transport);
          if (idx !== -1) this.remoteConnections.splice(idx, 1);
          setTimeout(connect, 5000);
        };
        
        formatLog(LogLevel.INFO, `Successfully connected to remote WebSocket`, LogCategory.CONNECTION, false, this.instanceId)
        
        this.remoteConnections.push({ server, transport, composer, url });

      } catch (error) {
        formatLog(LogLevel.ERROR, `Failed to connect to remote WebSocket: ${(error as Error).message}. Retrying in 5s...`, LogCategory.CONNECTION, false, this.instanceId)
        setTimeout(connect, 5000);
      }
    };

    // 启动首次连接
    connect();
  }

  /**
   * 处理新的 SSE 连接请求 (相当于原 app.get('/'))
   * 注意：需要外部路由处理 /mcp/:instanceId/sse
   */
  async handleSseRequest(req: Request, res: Response, endpointPath: string = '/messages') {
    formatLog(LogLevel.INFO, 'New SSE connection request received.', LogCategory.CONNECTION, false, this.instanceId)
    
    const composer = new McpServerComposer(this.baseServerInfo, this.instanceId)
    const server = composer.server
    // endpointPath 应该是客户端 POST 消息的地址，例如 /mcp/inst-1/messages
    const transport = new ExpressSSEServerTransport(endpointPath)

    if (this.parsedConfig) {
      await this._applyConfigurationToComposer(
        composer,
        server,
        this.parsedConfig.configureMcp
      )
    }

    await server.connect(transport)

    transport.onclose = () => {
      formatLog(
        LogLevel.INFO,
        `SSE transport for session ${transport.sessionId} closed.`
      )
      const sessionData = this.sseSessions.get(transport.sessionId)
      if (sessionData) {
        formatLog(
          LogLevel.INFO,
          `Closing McpServer and cleaning up resources for session ${transport.sessionId}.`
        )
        sessionData.server.close()
        this.sseSessions.delete(transport.sessionId)
        formatLog(
          LogLevel.INFO,
          `Session ${transport.sessionId} fully cleaned up.`
        )
      }
    }

    this.sseSessions.set(transport.sessionId, {
      composer,
      server,
      transport
    })
    
    formatLog(
      LogLevel.INFO,
      `Session ${transport.sessionId} opened and McpServer instance created.`
    )
    
    transport.handleSSERequest(res)
  }

  /**
   * 处理客户端发送的消息 (相当于原 app.post('/sessions'))
   */
  async handlePostMessage(sessionId: string, req: Request, res: Response) {
    const sessionData = this.sseSessions.get(sessionId)

    if (!sessionData) {
      formatLog(LogLevel.INFO, `Invalid or unknown session ID: ${sessionId}`)
      res.status(404).send('Session not found or invalid session ID')
      return
    }

    await sessionData.transport.handlePostMessage(req, res)
  }

  async start() {
    if (this.transportType === 'stdio' && this.stdioServer && this.stdioTransport) {
      formatLog(LogLevel.INFO, 'Initializing server in stdio mode...')
      await this.stdioServer.connect(this.stdioTransport)
      formatLog(LogLevel.INFO, 'Server initialized and connected in stdio mode')
    }
    // SSE 模式下不需要显式 start，因为是基于请求的
  }

  parseConfig(config: any) {
    const mcpServers = config?.mcpServers || {}

    const targetServers: McpServerType[] = []
    for (const serverName in mcpServers) {
      const serverConfig = mcpServers[serverName]
      const targetServer: McpServerType = {
        name: serverName,
        type: serverConfig.url ? 'sse' : 'stdio',
        url: serverConfig.url,
        params: serverConfig.url
          ? {}
          : {
            ...serverConfig
          }
      }
      targetServers.push(targetServer)
    }
    return targetServers
  }

  private async _applyConfigurationToComposer(
    composer: McpServerComposer,
    server: McpServer,
    configureMcp: Function | null
  ) {
    if (!this.parsedConfig) {
      formatLog(
        LogLevel.DEBUG,
        'No parsed config available to apply to composer.'
      )
      return
    }

    composer.namespace = this.parsedConfig.namespace

    if (typeof configureMcp === 'function') {
      // @ts-ignore
      z._fieldsToZodSchema = fieldsToZodSchema
      configureMcp(server, ResourceTemplate, z)
    }

    for (const targetServer of this.parsedConfig.targetServers) {
      let mcpClientConfig
      if (targetServer.type === 'sse') {
        mcpClientConfig = {
          name: targetServer.name,
          type: 'sse',
          url: new URL(targetServer.url!),
          params: targetServer.params,
          tools: targetServer.tools
        }
      } else {
        mcpClientConfig = {
          name: targetServer.name,
          type: 'stdio',
          params: targetServer.params,
          tools: targetServer.tools
        }
      }
      
      // 注意：这里可能需要 try-catch，避免单个连接失败导致整个流程中断
      try {
        await composer.add(mcpClientConfig as any, {
          name:
            targetServer.name ??
            (targetServer.url
              ? new URL(targetServer.url).hostname
              : 'stdio-server'),
          version: targetServer.version ?? '1.0.0',
          description: targetServer.description ?? ''
        })
      } catch (err) {
        formatLog(LogLevel.ERROR, `Failed to add target server ${targetServer.name}: ${(err as Error).message}`)
      }
    }

    for (const toolChain of this.parsedConfig.toolChains) {
      composer.composeToolChain(toolChain)
    }

    const registeredTools = server['_registeredTools']

    if (this.parsedConfig.toolsFilter.length > 0) {
      for (const name in registeredTools) {
        if (!this.parsedConfig.toolsFilter.includes(name)) {
          ; (registeredTools[name] as any).disable()
        }
      }
    }

    if (Array.isArray(this.parsedConfig.toolChains)) {
      for (const toolChain of this.parsedConfig.toolChains) {
        if (registeredTools[toolChain.name]) {
          ; (registeredTools[toolChain.name] as any).enable()
        }
      }
    }
  }

  public getActiveServer(): McpServer {
    if (this.transportType === 'stdio' && this.stdioServer) {
      return this.stdioServer
    }
    if (this.transportType === 'sse' && this.defaultSseServer) {
      return this.defaultSseServer
    }
    throw new Error('No active server available')
  }

  public getActiveComposer(): McpServerComposer {
    if (this.transportType === 'stdio' && this.stdioComposer) {
      return this.stdioComposer
    }
    if (this.transportType === 'sse' && this.defaultSseComposer) {
      return this.defaultSseComposer
    }
    throw new Error('No active composer available')
  }

  async importMcpConfig(config: any, configureMcp: Function | null) {
    const targetServers = this.parseConfig(config)
    const toolChains = config?.toolChains || []
    const rawNamespace = config.namespace || NAMESPACE_SEPARATOR
    const namespace =
      typeof rawNamespace === 'string' && /^[A-Za-z0-9_.-]+$/.test(rawNamespace)
        ? rawNamespace
        : NAMESPACE_SEPARATOR
    const toolsFilter = config?.tools || []

    this.parsedConfig = {
      targetServers,
      toolChains,
      toolsFilter,
      namespace,
      configureMcp
    }

    // 为默认SSE服务器应用配置
    if (
      this.transportType === 'sse' &&
      this.defaultSseComposer &&
      this.defaultSseServer
    ) {
      await this._applyConfigurationToComposer(
        this.defaultSseComposer,
        this.defaultSseServer,
        this.parsedConfig.configureMcp
      )
    }

    // 为stdio服务器应用配置
    if (
      this.transportType === 'stdio' &&
      this.stdioComposer &&
      this.stdioServer
    ) {
      formatLog(
        LogLevel.INFO,
        'Applying new configuration to existing stdio server instance.'
      )
      await this._applyConfigurationToComposer(
        this.stdioComposer,
        this.stdioServer,
        this.parsedConfig.configureMcp
      )
    }
  }

  async updateNodesConfig(
    mcpServers: Record<string, any>,
    options?: {
      toolChains?: any[]
      tools?: string[]
      namespace?: string
    }
  ) {
    const targetServers = this.parseConfig({ mcpServers })
    const toolChains = options?.toolChains ?? (this.parsedConfig?.toolChains || [])
    const toolsFilter = options?.tools ?? (this.parsedConfig?.toolsFilter || [])
    const namespace = options?.namespace ?? (this.parsedConfig?.namespace || NAMESPACE_SEPARATOR)
    const configureMcp = this.parsedConfig?.configureMcp || null

    this.parsedConfig = {
      targetServers,
      toolChains,
      toolsFilter,
      namespace,
      configureMcp
    }

    const targetNames = new Set(targetServers.map(server => server.name))

    if (
      this.transportType === 'sse' &&
      this.defaultSseComposer &&
      this.defaultSseServer
    ) {
      this.defaultSseComposer.pruneTargets(targetNames)
      await this._applyConfigurationToComposer(
        this.defaultSseComposer,
        this.defaultSseServer,
        configureMcp
      )
    }

    if (
      this.transportType === 'stdio' &&
      this.stdioComposer &&
      this.stdioServer
    ) {
      this.stdioComposer.pruneTargets(targetNames)
      await this._applyConfigurationToComposer(
        this.stdioComposer,
        this.stdioServer,
        configureMcp
      )
    }

    const currentRemotes = [...this.remoteConnections]
    this.remoteConnections = []
    for (const remote of currentRemotes) {
      remote.transport.onclose = null
      await remote.transport.close()
      this.connectToRemote(remote.url)
    }
  }

  async close(): Promise<void> {
    try {
      formatLog(LogLevel.INFO, 'Shutting down McpRouterServer...')

      if (this.transportType === 'sse') {
        // 关闭默认SSE服务器
        if (this.defaultSseServer) {
          try {
            await this.defaultSseServer.close()
            this.defaultSseServer = null
            this.defaultSseComposer = null
          } catch (error) {
            formatLog(
              LogLevel.ERROR,
              `Error closing default SSE server: ${(error as Error).message}`
            )
          }
        }

        const sseServerClosePromises = Array.from(
          this.sseSessions.values()
        ).map(async sessionData => {
          try {
            formatLog(
              LogLevel.INFO,
              `Closing McpServer for session ${sessionData.transport.sessionId}...`
            )
            await sessionData.server.close()
          } catch (error) {
            formatLog(
              LogLevel.ERROR,
              `Error closing McpServer for session ${sessionData.transport.sessionId
              }: ${(error as Error).message}`
            )
          }
        })
        await Promise.all(sseServerClosePromises)

        if (this.sseSessions.size > 0) {
          formatLog(
            LogLevel.INFO,
            `${this.sseSessions.size} SSE sessions still in map after close attempts. Forcibly clearing.`
          )
          this.sseSessions.clear()
        }
      }

      if (this.transportType === 'stdio' && this.stdioServer) {
        formatLog(LogLevel.INFO, 'Closing stdio McpServer...')
        try {
          await this.stdioTransport?.close()
          await this.stdioServer.close()
        } catch (error) {
          formatLog(
            LogLevel.ERROR,
            `Error closing stdio McpServer: ${(error as Error).message}`
          )
        }
        this.stdioServer = null
        this.stdioComposer = null
        this.stdioTransport = null
      }

      formatLog(LogLevel.INFO, 'McpRouterServer shut down completely.')
    } catch (error) {
      formatLog(
        LogLevel.ERROR,
        `Critical error during McpRouterServer shutdown: ${(error as Error).message
        }`
      )
      throw error
    }
  }
}
