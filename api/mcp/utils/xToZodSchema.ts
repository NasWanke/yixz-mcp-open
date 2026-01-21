// 类型定义
interface Field {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'enum'
  description?: string
  isOptional?: boolean
  defaultValue?: any
  options?: string[] // 用于enum类型
}

interface ToolDefinition {
  name: string
  description: string
  fields: Field[]
}

// 将字段转换为Zod Schema
export function fieldsToZodSchema (
  fields: Field[],
  asCode: boolean = true
): string | Record<string, any> {
  if (!asCode) {
    // 返回Zod对象
    const zodObj: Record<string, any> = {}
    fields.forEach(field => {
      let zodField: any
      switch (field.type) {
        case 'string':
          zodField = require('zod').z.string()
          break
        case 'number':
          zodField = require('zod').z.number()
          break
        case 'boolean':
          zodField = require('zod').z.boolean()
          break
        case 'date':
          zodField = require('zod').z.date()
          break
        case 'enum':
          zodField = require('zod').z.enum(field.options || [])
          break
        default:
          zodField = require('zod').z.unknown()
      }
      if (field.isOptional) {
        zodField = zodField.optional()
      }
      if (field.description) {
        zodField = zodField.describe(field.description)
      }
      //默认值
      if (field.defaultValue) {
        zodField = zodField.default(field.defaultValue)
      }
      zodObj[field.name] = zodField
    })
    return zodObj
  }
  // 原有代码字符串逻辑
  let schemaCode = '{\n'
  fields.forEach(field => {
    let zodField = ''
    switch (field.type) {
      case 'string':
        zodField = 'z.string()'
        break
      case 'number':
        zodField = 'z.number()'
        break
      case 'boolean':
        zodField = 'z.boolean()'
        break
      case 'date':
        zodField = 'z.date()'
        break
      case 'enum':
        const enumValues =
          field.options?.map(opt => `'${opt}'`).join(', ') || ''
        zodField = `z.enum([${enumValues}])`
        break
      default:
        zodField = 'z.unknown()'
    }
    if (field.isOptional) {
      zodField += '.optional()'
    }
    if (field.description) {
      zodField += `.describe('${field.description}')`
    }
    if (field.defaultValue) {
      zodField += `.default('${field.defaultValue}')`
    }
    schemaCode += `    ${field.name}: ${zodField},\n`
  })
  schemaCode += '  }'
  return schemaCode
}

// 生成工具代码
export function generateToolCode (toolDef: ToolDefinition): string {
  const schemaCode = fieldsToZodSchema(toolDef.fields)

  return (
    `import z from 'zod';\n\n` +
    `export const ${toolDef.name} = {\n` +
    `  name: '${toolDef.name}',\n` +
    `  description: '${toolDef.description}',\n` +
    `  schema: ${schemaCode},\n` +
    `  handler: async (\n` +
    `    args: any,\n` +
    `    client: any,\n` +
    `    sendNotification: any\n` +
    `  ) => {\n` +
    `    // 打印工具参数\n` +
    `    console.log('工具参数:', args);\n\n` +
    `    // TODO: 在这里实现工具逻辑\n\n` +
    `    return {\n` +
    `      content: [\n` +
    `        {\n` +
    `          type: 'text',\n` +
    `          text: \`处理结果: \${JSON.stringify(args)}\`\n` +
    `        }\n` +
    `      ]\n` +
    `    };\n` +
    `  }\n` +
    `};\n`
  )
}

//参数同 exampleTool
export function createDatabaseTool (
  name: string,
  description: string,
  fields: any,
  toolHandler: (args: any) => any
) {
  console.log('createDatabaseTool', name, description, fields, toolHandler)

  const schema = fieldsToZodSchema(fields)
  return {
    name,
    description,
    schema
  }
}

// 生成参数示例
function generateJsonExample (fields: Field[]): Record<string, any> {
  const jsonExample: Record<string, any> = {}

  fields.forEach(field => {
    switch (field.type) {
      case 'string':
        jsonExample[field.name] = field.description || '示例字符串'
        break
      case 'number':
        jsonExample[field.name] = 0
        break
      case 'boolean':
        jsonExample[field.name] = true
        break
      case 'date':
        jsonExample[field.name] = new Date().toISOString()
        break
      case 'enum':
        jsonExample[field.name] = field.options?.[0] || ''
        break
      default:
        jsonExample[field.name] = null
    }
  })

  return jsonExample
}
