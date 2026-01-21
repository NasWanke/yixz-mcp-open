import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  McpServer,
  type ResourceMetadata
} from '@modelcontextprotocol/sdk/server/mcp.js'
import type {
  Implementation,
  Tool,
  CallToolResult,
  Resource,
  Prompt
} from '@modelcontextprotocol/sdk/types.js'
import {
  SSEClientTransport,
  type SSEClientTransportOptions
} from '@modelcontextprotocol/sdk/client/sse.js'
import {
  StdioClientTransport,
  type StdioServerParameters
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { jsonSchemaToZod } from '../utils/schemaConverter'
import { formatLog, LogLevel, LogCategory } from '../utils/console'
import createDatabase from '../utils/database'
import { sendNotify } from '../cronjob/notify'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const NAMESPACE_SEPARATOR = '.'
const TIMEOUT = 60000 * 120
const DEFAULT_REQUEST_TIMEOUT_MSEC = 60000 * 3 // Increase timeout to 3 minutes

type ConnectionConfig =
  | {
      type: 'sse'
      url: URL
      params: SSEClientTransportOptions
      tools: string[]
      name: string
    }
  | {
      type: 'stdio'
      params: StdioServerParameters
      tools: string[]
      name: string
    }

interface ToolChainStep {
  toolName: string
  args: any
  outputMapping?: {
    [key: string]: string // 将当前步骤的输出映射到下一个步骤的输入
  }
  fromStep?: number
}

interface ToolChainOutput {
  steps?: number[] // 指定要输出的步骤索引，如果为空则输出所有步骤
  final?: boolean // 是否只输出最后一步
}

interface ToolChain {
  name: string
  steps: ToolChainStep[]
  description?: string
  output?: ToolChainOutput // 添加输出配置
}

export class McpServerComposer {
  public readonly server: McpServer
  public namespace: string = NAMESPACE_SEPARATOR
  
  private readonly targetClients: Map<
    string,
    {
      clientInfo: Implementation
      config: ConnectionConfig
    }
  > = new Map()
  private readonly clientTools: Map<string, Set<string>> = new Map()

  constructor (serverInfo: Implementation, private instanceId?: string) {
    // console.log('serverInfo::: ', serverInfo)

    serverInfo.name =
      (serverInfo as any).serverName || serverInfo.name || 'MCPSERVER.exe'
    serverInfo.version =
      (serverInfo as any).serverVersion || serverInfo.version || '1.0.0'

    this.server = new McpServer(serverInfo, {
      capabilities: {
        logging: {}, // 启用日志能力
        resources: {
          // 其他能力也可以一起设置
          listChanged: true
        },
        tools: {
          listChanged: true
        },
        prompts: {
          listChanged: true
        }
      }
    })

    // 确保 _registeredTools 被初始化
    // @ts-ignore
    if (!this.server._registeredTools) {
      // @ts-ignore
      this.server._registeredTools = {}
    }

    // 绑定工具方法
    // @ts-ignore
    this.server._client = {
      callTool: async (toolName: string, args: any, options?: any) =>
        this.callTool(toolName, args, options),
      hasToolAvailable: async (toolName: string) =>
        this.hasToolAvailable(toolName),
      listTools: async () => this.listTools(),
      findTool: async (toolName: string) => this.findTool(toolName),
      listPrompts: async () => this.listPrompts(),
      getPrompt: async (promptName: string, args: any) =>
        this.getPrompt(promptName, args),
      listResources: async () => this.listResources(),
      readResource: async (resourceName: string) =>
        this.readResource(resourceName),
      createDatabase: createDatabase,
      sendNotify: async (notifyConfigs: any, data: any) =>
        await sendNotify(notifyConfigs, data),
      log: async (
        level: LogLevel,
        message: string,
        category?: LogCategory,
        sendNotification?: boolean
      ) => formatLog(level, message, category, sendNotification, this.instanceId)
    }
  }

  async add (
    config: ConnectionConfig,
    clientInfo: Implementation,
    skipRegister = false,
    retryCount = 0
  ): Promise<void> {
    const targetClient = new Client(clientInfo) 

    // 用来调试的 - 发现mac上的路径，通过参数调用的exe路径有问题（需要用绝对路径）
    // await formatLog(
    //   LogLevel.ERROR,
    //   `当前工作目录: ${process.cwd()}\n` +
    //   `可执行文件路径: ${process.execPath}\n` +
    //   `启动参数: ${process.argv.join(' ')}`
    // )

    const transport = this.createTransport(config); // 使用统一的 createTransport 方法

    try {
      await targetClient.connect(transport, {
        timeout: DEFAULT_REQUEST_TIMEOUT_MSEC //默认值
      })
    } catch (error) {
      if (retryCount >= 2) {
        await formatLog(
          LogLevel.ERROR,
          `Connection failed after 2 retries: ${
            config.type === 'sse' ? config.url : config.params.command
          } -> ${clientInfo.name}\n` +
            `Reason: ${(error as Error).message}\n` +
            `Config: ${JSON.stringify(config)}\n` +
            `Skipping connection...`,
          LogCategory.CONNECTION,
          false,
          this.instanceId
        )
        return
      }

      await formatLog(
        LogLevel.ERROR,
        `Connection failed: ${
          config.type === 'sse' ? config.url : config.params.command
        } -> ${clientInfo.name}\n` +
          `Reason: ${(error as Error).message}\n` +
          `Will retry in 6 seconds... (Attempt ${retryCount + 1}/2)`,
        LogCategory.CONNECTION,
        false,
        this.instanceId
      )

      // If the connection fails, retry after 15 seconds
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(this.add(config, clientInfo, skipRegister, retryCount + 1))
        }, 6000)
      })
    }

    await formatLog(
      LogLevel.INFO,
      `Successfully connected to server: ${
        config.type === 'sse' ? config.url : config.params.command
      } (${clientInfo.name})`,
      LogCategory.CONNECTION,
      false,
      this.instanceId
    )

    const name = config.name

    this.targetClients.set(name, { clientInfo, config })

    if (skipRegister) {
      await formatLog(
        LogLevel.INFO,
        `Skipping capability registration: ${name}`
      )
      return
    }

    const capabilities = await targetClient.getServerCapabilities()

    await formatLog(
      LogLevel.INFO,
      `Starting server capability registration: ${name} ${JSON.stringify(
        capabilities,
        null,
        2
      )}`
    )

    if (capabilities?.tools) {
      let tools: any = null
      try {
        tools = await targetClient.listTools()
      } catch (error) {
        console.log('Tool list:::error ', error)
      }

      try {
        this.composeTools(tools.tools, name)

        await formatLog(
          LogLevel.INFO,
          `Tool registration completed [${name}]: ${tools.tools.length} tools in total`
        )
      } catch (error) {
        await formatLog(
          LogLevel.ERROR,
          `Tool registration failed: ${name} ${JSON.stringify(error, null, 2)}`
        )
      }
    }

    if (capabilities?.resources) {
      try {
        const resources = await targetClient.listResources()
        this.composeResources(resources.resources, name)

        await formatLog(
          LogLevel.INFO,
          `Resource registration completed [${name}]: ${resources.resources.length} resources in total`
        )
      } catch (error) {
        await formatLog(
          LogLevel.ERROR,
          `Resource registration failed: ${name} ${JSON.stringify(
            error,
            null,
            2
          )}`
        )
      }
    }

    if (capabilities?.prompts) {
      try {
        const prompts = await targetClient.listPrompts()
        this.composePrompts(prompts.prompts, name)

        await formatLog(
          LogLevel.INFO,
          `Prompt registration completed [${name}]: ${prompts.prompts.length} prompts in total`
        )
      } catch (error) {
        await formatLog(
          LogLevel.ERROR,
          `Prompt registration failed: ${name} ${JSON.stringify(
            error,
            null,
            2
          )}`
        )
      }
    }

    await formatLog(
      LogLevel.INFO,
      `All capabilities registration completed for server ${name}`
    )
    targetClient.close()
  }

  composeToolChain (toolChain: ToolChain) {
    this.server.tool(
      toolChain.name,
      toolChain.description ?? 'Execute a chain of tools',
      toolChain.steps[0]?.args
        ? jsonSchemaToZod({
            type: 'object',
            properties: Object.fromEntries(
              Object.entries(toolChain.steps[0].args).map(([key, value]) => [
                key,
                {
                  type: Array.isArray(value) ? 'array' : typeof value,
                  default: value
                }
              ])
            ),
            required: Object.keys(toolChain.steps[0].args)
          })
        : {},
      async (args: any = {}, { sendNotification }) => {
        const results: any[] = []
        const clientsMap = new Map<string, Client>()

        try {
          for (let i = 0; i < toolChain.steps.length; i++) {
            const step = toolChain.steps[i]

            if (i == 0) {
              //第一个，需要处理入参
              step.args = { ...(step.args || {}), ...args }
            }

            // 查找所有注册的工具中匹配的工具（支持命名空间和非命名空间）
            let registeredTool
            let foundToolName

            // @ts-ignore
            for (const [name, tool] of Object.entries(
              // @ts-ignore
              this.server._registeredTools
            )) {
              if (
                name === step.toolName ||
                name.endsWith(`${this.namespace}${step.toolName}`)
              ) {
                registeredTool = tool
                foundToolName = name
                break
              }
            }

            if (!registeredTool) {
              throw new Error(`Tool not found: ${step.toolName}`)
            }

            await formatLog(
              LogLevel.DEBUG,
              `Executing chain step ${i}: ${foundToolName}\n`,
              LogCategory.TOOL,
              sendNotification
            )

            if (step.outputMapping) {
              const sourceResult =
                step.fromStep !== undefined
                  ? results[step.fromStep]
                  : results[results.length - 1]

              if (sourceResult) {
                for (const [key, path] of Object.entries(step.outputMapping)) {
                  try {
                    const value = this.getNestedValue(sourceResult, path)
                    if (value !== undefined) {
                      step.args[key] = value
                    } else {
                      await formatLog(
                        LogLevel.INFO,
                        `Output mapping path "${path}" returned undefined for step ${i}`,
                        LogCategory.TOOL,
                        sendNotification
                      )
                    }
                  } catch (error) {
                    await formatLog(
                      LogLevel.ERROR,
                      `Failed to map output for step ${i}: ${error.message}`,
                      LogCategory.TOOL,
                      sendNotification
                    )
                  }
                }
              }
            }

            let result
            try {
              if (registeredTool.needsClient) {
                let foundClientName: string | undefined

                for (const [clientName, _] of this.targetClients.entries()) {
                  // 使用 clientTools 来判断客户端是否真的支持这个工具
                  const supportedTools = this.clientTools.get(clientName)
                  // 检查完整的命名空间工具名
                  if (supportedTools?.has(foundToolName)) {
                    foundClientName = clientName
                    break
                  }
                }

                if (!foundClientName) {
                  throw new Error(`No client found for tool: ${foundToolName}`)
                }

                // 复用或创建客户端连接
                let client = clientsMap.get(foundClientName)
                if (!client) {
                  const clientItem = this.targetClients.get(foundClientName)
                  if (!clientItem) {
                    throw new Error(
                      `Client configuration not found for: ${foundClientName}`
                    )
                  }
                  client = new Client(clientItem.clientInfo)
                  await client.connect(this.createTransport(clientItem.config))
                  clientsMap.set(foundClientName, client)
                }

                result = await registeredTool.chainExecutor(step.args, client, {
                  timeout: TIMEOUT
                })
              } else {
                // 本地工具直接调用
                result = await registeredTool.callback(step.args, {
                  timeout: TIMEOUT
                })
              }

              // 确保结果不是undefined
              results.push(result || { content: [{ type: 'text', text: '' }] })
            } catch (error) {
              await formatLog(
                LogLevel.ERROR,
                `Step ${i} (${foundToolName}) execution failed: ${error.message}`,
                LogCategory.TOOL,
                sendNotification
              )
              // 在错误时添加一个空结果
              results.push({
                content: [{ type: 'text', text: `Error: ${error.message}` }]
              })
            }
          }

          await formatLog(
            LogLevel.DEBUG,
            `Chain execution completed`,
            LogCategory.TOOL,
            sendNotification
          )

          // 处理输出结果时添加安全检查
          let outputResults: any[] = []
          try {
            if (toolChain.output?.final) {
              const finalResult = results[results.length - 1]
              outputResults = finalResult ? [finalResult] : []
            } else if (
              toolChain.output?.steps &&
              toolChain.output.steps.length > 0
            ) {
              outputResults = toolChain.output.steps
                .filter(
                  stepIndex => stepIndex >= 0 && stepIndex < results.length
                )
                .map(stepIndex => results[stepIndex])
                .filter(result => result !== undefined)
            } else {
              outputResults = results.filter(result => result !== undefined)
            }
          } catch (error) {
            await formatLog(
              LogLevel.ERROR,
              `Failed to process output results: ${error.message}`,
              LogCategory.TOOL,
              sendNotification
            )
            outputResults = []
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(outputResults || [])
              }
            ]
          }
        } finally {
          // 关闭所有客户端连接
          for (const client of clientsMap.values()) {
            await client.close()
          }
        }
      }
    )
  }

  private getNestedValue (obj: any, path: string): any {
    try {
      return path.split('.').reduce((current, key) => {
        if (current === undefined || current === null) {
          return undefined
        }
        return current[key]
      }, obj)
    } catch (error) {
      formatLog(
        LogLevel.ERROR,
        `Failed to get nested value for path "${path}": ${error.message}`
      )
      return undefined
    }
  }

  listTargetClients () {
    return Array.from(this.targetClients.entries()).map(([name, data]) => ({
      name,
      config: data.config,
      status: 'connected', // 简化处理，实际上如果在 map 中通常是连接成功的，或者我们可以维护更详细的状态
      clientInfo: data.clientInfo,
      toolsCount: this.clientTools.get(name)?.size || 0
    }));
  }

  private resolveCommandPath(command: string): string {
    // Simple resolution - just return the command
    // In a more complex implementation, this could search PATH
    return command;
  }

  private resolveNpxCliPath(command: string): string | null {
     // 尝试在常见的 nodejs 安装目录下查找对应的 cli.js
     // command 应该是 'npm' 或 'npx'
     const possiblePaths = [
       path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', `${command}-cli.js`),
       path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', `${command}-cli.js`), // Linux/Mac structure
       path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'npm', 'bin', `${command}-cli.js`),
       // 硬编码常见路径
       `C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\${command}-cli.js`
     ];

     console.log(`[DEBUG] resolving ${command} cli path from:`, possiblePaths);

     for (const p of possiblePaths) {
       if (fs.existsSync(p)) {
         formatLog(LogLevel.DEBUG, `Found CLI JS at: ${p}`);
         console.log(`[DEBUG] Found CLI JS at: ${p}`);
         return p;
       }
     }
     
     return null;
   }

  private createTransport (config: ConnectionConfig) {
    if (config.type === 'sse') {
      return new SSEClientTransport(config.url)
    } else {
      let command = config.params.command;
      let args = config.params.args || [];
      
      console.log(`[DEBUG] createTransport initial command: ${command}, platform: ${process.platform}`);

      if (process.platform === 'win32' && (command === 'npm' || command === 'npx')) {
         const cliPath = this.resolveNpxCliPath(command);
         if (cliPath) {
           // 找到了 cli.js，直接用 node 执行
           formatLog(LogLevel.DEBUG, `Switching to node execution: ${process.execPath} ${cliPath}`);
           console.log(`[DEBUG] Switching to node execution: ${process.execPath} ${cliPath}`);
           args = [cliPath, ...args];
           command = process.execPath;
         } else {
           // 没找到，回退到 .cmd 逻辑
           console.log(`[DEBUG] CLI path not found, falling back to .cmd`);
           const cmdCommand = `${command}.cmd`;
           const resolved = this.resolveCommandPath(cmdCommand);
           if (resolved !== cmdCommand) command = resolved;
           else command = cmdCommand;
         }
      } else if (process.platform === 'win32') {
         // 其他命令的 Windows 处理
         const resolved = this.resolveCommandPath(command);
         if (resolved !== command) command = resolved;
      }

      // 添加调试日志
      formatLog(
        LogLevel.DEBUG, 
        `Creating Stdio transport with command: ${command}, args: ${JSON.stringify(args)}`
      );
      console.log(`[DEBUG] Final transport command: ${command}, args: ${JSON.stringify(args)}`);

      return new StdioClientTransport({
        ...config.params,
        command,
        args
      });
    }
  }

  private composeTools (tools: Tool[], name: string) {
    if (!Array.isArray(tools)) {
      throw new Error('Tools must be an array')
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Name must be a non-empty string')
    }

    try {
      //@ts-ignore
      const existingTools = this.server._registeredTools
      // 记录这个客户端支持的工具
      const toolSet = new Set<string>()

      for (const tool of tools) {
        try {
          if (!tool.name) {
            throw new Error('Tool name is required')
          }

          // 使用客户端名称作为命名空间
          const namespacedToolName = `${name}${this.namespace}${tool.name}`
          toolSet.add(namespacedToolName)

          if (existingTools[namespacedToolName]) {
            formatLog(
              LogLevel.INFO,
              `Tool ${namespacedToolName} already exists, skipping...`
            )
            continue
          }

          let schemaObject
          try {
            schemaObject = jsonSchemaToZod(tool.inputSchema)
          } catch (error) {
            throw new Error(
              `Failed to convert schema for tool ${tool.name}: ${error.message}`
            )
          }

          // 创建工具执行函数
          const toolExecutor = async (
            args: any,
            client?: Client,
            options?: any
          ) => {
            let needToClose = false
            let toolClient = client

            try {
              if (!toolClient) {
                // 如果没有传入client，说明是直接调用，需要创建新的连接
                const clientItem = this.targetClients.get(name)
                if (!clientItem) {
                  throw new Error(`Client for ${name} not found`)
                }

                toolClient = new Client(clientItem.clientInfo)
                try {
                  await toolClient.connect(
                    this.createTransport(clientItem.config)
                  )
                  needToClose = true // 标记需要关闭连接
                } catch (error) {
                  throw new Error(
                    `Failed to connect to client: ${error.message}`
                  )
                }
              }

              await formatLog(
                LogLevel.DEBUG,
                `Calling tool: ${tool.name} from ${name}\n`
              )

              try {
                const result = await toolClient.callTool(
                  {
                    name: tool.name, // 调用原始工具名
                    arguments: args
                  },
                  undefined,
                  options
                )
                return result as CallToolResult
              } catch (error) {
                throw new Error(`Tool execution failed: ${error.message}`)
              }
            } finally {
              if (needToClose && toolClient) {
                try {
                  await toolClient.close()
                } catch (closeError) {
                  await formatLog(
                    LogLevel.ERROR,
                    `Failed to close client connection: ${closeError.message}`
                  )
                }
              }
            }
          }

          try {
            // 注册工具时使用带命名空间的名称
            this.server.tool(
              namespacedToolName,
              `[${name}] ${tool.description ?? ''}`, // 在描述中标明来源
              schemaObject,
              async args => toolExecutor(args)
            )

            // 保存执行函数和标记为需要客户端的工具
            // @ts-ignore
            this.server._registeredTools[namespacedToolName].chainExecutor =
              toolExecutor
            // @ts-ignore
            this.server._registeredTools[namespacedToolName].needsClient = true
            // 保存原始工具名到元数据中
            // @ts-ignore
            this.server._registeredTools[namespacedToolName].originalName =
              tool.name

            formatLog(
              LogLevel.INFO,
              `Successfully registered tool: ${namespacedToolName}`
            )
          } catch (error) {
            throw new Error(
              `Failed to register tool ${namespacedToolName}: ${error.message}`
            )
          }
        } catch (error) {
          formatLog(LogLevel.ERROR, `Failed to process tool: ${error.message}`)
          throw error // 重新抛出错误以便上层处理
        }
      }

      this.clientTools.set(name, toolSet)
      formatLog(
        LogLevel.INFO,
        `Successfully registered ${toolSet.size} tools for ${name}`
      )
    } catch (error) {
      formatLog(LogLevel.ERROR, `Failed to compose tools: ${error.message}`)
      throw error // 重新抛出错误以便上层处理
    }
  }

  private composeResources (resources: Resource[], name: string) {
    // @ts-ignore
    const existingResources = this.server._registeredResources
    //  console.log(existingResources,resources)
    for (const resource of resources) {
      if (existingResources[resource.uri]) {
        continue
      }
      this.server.resource(
        resource.name,
        resource.uri,
        { description: resource.description, mimeType: resource.mimeType },
        async uri => {
          const clientItem = this.targetClients.get(name)
          if (!clientItem) {
            throw new Error(`Client for ${name} not found`)
          }

          const client = new Client(clientItem.clientInfo)
          await client.connect(this.createTransport(clientItem.config))

          const result = await client.readResource({
            uri: uri.toString(),
            _meta: resource._meta as ResourceMetadata
          })
          await client.close()
          return result
        }
      )
    }
  }

  private composePrompts (prompts: Prompt[], name: string) {
    // @ts-ignore
    const existingPrompts = this.server._registeredPrompts
    for (const prompt of prompts) {
      if (existingPrompts[prompt.name]) {
        continue
      }
      const argsSchema = jsonSchemaToZod(prompt.arguments)
      this.server.prompt(
        prompt.name,
        prompt.description ?? '',
        argsSchema,
        async args => {
          const clientItem = this.targetClients.get(name)
          if (!clientItem) {
            throw new Error(`Client for ${name} not found`)
          }

          const client = new Client(clientItem.clientInfo)
          await client.connect(this.createTransport(clientItem.config))

          const result = await client.getPrompt({
            name: prompt.name,
            arguments: args as { [x: string]: string }
          })
          await client.close()
          return result
        }
      )
    }
  }

  private handleTargetServerClose (
    name: string,
    config: ConnectionConfig,
    clientInfo: Implementation
  ) {
    return () => {
      this.targetClients.delete(name)

      formatLog(
        LogLevel.ERROR,
        `Server connection lost:\n` +
          `- Name: ${name}\n` +
          `- Type: ${config.type}\n` +
          `- Config: ${
            config.type === 'sse' ? config.url : config.params.command
          }\n` +
          `- Client: ${clientInfo.name}\n` +
          `Will try to reconnect in 10 seconds...`
      )

      return this.add(config, clientInfo, true)
    }
  }

  async disconnectAll () {
    for (const client of this.targetClients.keys()) {
      await this.disconnect(client)
    }
  }

  async disconnect (clientName: string) {
    const client = this.targetClients.get(clientName)
    if (client) {
      this.targetClients.delete(clientName)
    }
  }

  /**
   * 查找已注册的工具
   */
  public async findTool (toolName: string): Promise<{
    tool: any
    fullName: string
  } | null> {
    try {
      const tools = this.getRegisteredTools()
      for (const [name, tool] of Object.entries(tools)) {
        // console.log(name,tool,toolName)
        if (
          name === toolName ||
          name.endsWith(`${this.namespace}${toolName}`)
        ) {
          return { tool, fullName: name }
        }
      }
      return null
    } catch (error) {
      formatLog(LogLevel.ERROR, `查找工具失败: ${error.message}`)
      return null
    }
  }

  public async getPrompt (promptName: string, args: any) {
    // @ts-ignore
    return this.server._registeredPrompts[promptName]
  }

  public async listPrompts () {
    // @ts-ignore
    return this.server._registeredPrompts
  }

  public async listResources () {
    // @ts-ignore
    return this.server._registeredResources
  }

  public async readResource (resourceName: string) {
    // @ts-ignore
    return this.server._registeredResources[resourceName]
  }

  /**
   * 列出所有已注册的工具
   */
  public async listTools (): Promise<
    Array<{
      name: string
      description: string
      needsClient: boolean
    }>
  > {
    try {
      const tools = []
      // @ts-ignore
      for (const [name, tool] of Object.entries(this.server._registeredTools)) {
        if (tool) {
          // 添加工具对象存在性检查
          tools.push({
            name,
            // @ts-ignore
            description: tool.description || '',
            // @ts-ignore
            needsClient: tool.needsClient || false
          })
        }
      }
      return tools
    } catch (error) {
      formatLog(LogLevel.ERROR, `列出工具失败: ${error.message}`)
      return []
    }
  }

  /**
   * 调用工具
   * @param toolName 工具名称
   * @param args 工具参数
   * @returns 工具执行结果
   */
  public async callTool (
    toolName: string,
    args: any = {},
    options?: any
  ): Promise<any> {
    try {
      const toolInfo = await this.findTool(toolName)
      if (!toolInfo) {
        throw new Error(`工具未找到: ${toolName}`)
      }

      const { tool, fullName } = toolInfo
      await formatLog(LogLevel.DEBUG, `正在调用工具: ${fullName}`)

      if (tool.needsClient) {
        // 查找支持该工具的客户端
        let foundClientName: string | undefined
        for (const [clientName, _] of this.targetClients.entries()) {
          const supportedTools = this.clientTools.get(clientName)
          if (supportedTools?.has(fullName)) {
            foundClientName = clientName
            break
          }
        }

        if (!foundClientName) {
          throw new Error(`未找到支持该工具的客户端: ${fullName}`)
        }

        // 创建客户端连接
        const clientItem = this.targetClients.get(foundClientName)
        if (!clientItem) {
          throw new Error(`客户端配置未找到: ${foundClientName}`)
        }

        const client = new Client(clientItem.clientInfo)
        try {
          await client.connect(this.createTransport(clientItem.config))
          const result = await tool.chainExecutor(args, client, options)
          return result
        } finally {
          await client.close()
        }
      } else {
        // 本地工具直接调用
        return await tool.callback(args, options)
      }
    } catch (error) {
      await formatLog(LogLevel.ERROR, `工具调用失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 检查工具是否存在
   * @param toolName 工具名称
   * @returns 是否存在
   */
  public async hasToolAvailable (toolName: string): Promise<boolean> {
    return (await this.findTool(toolName)) !== null
  }

  private getRegisteredTools () {
    // @ts-ignore
    return this.server._registeredTools || {} // 假设 McpServer 有 _registeredTools
  }
}
