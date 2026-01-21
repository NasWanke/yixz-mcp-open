import { z } from 'zod'
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { SSEClientTransportOptions } from '@modelcontextprotocol/sdk/client/sse.js'

export const mcpServerSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(['sse', 'stdio']),
  params: z.custom<StdioServerParameters | SSEClientTransportOptions>().optional(),
  tools: z.array(z.string()).optional()
})

export type McpServerType = z.infer<typeof mcpServerSchema>

export const configSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  servers: z.record(z.string(), mcpServerSchema)
})

export type ConfigType = z.infer<typeof configSchema>
