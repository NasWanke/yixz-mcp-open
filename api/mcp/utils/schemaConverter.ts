import { z } from 'zod'

interface JSONSchema {
  properties: Record<string, JSONSchemaProperty> | JSONSchema
  required?: string[]
}

interface JSONSchemaProperty {
  type: string
  items?: JSONSchemaProperty
  default?: any // 添加默认值属性
}

/**
 * Converts a JSON schema object to a Zod schema
 * @param jsonSchema The JSON schema to convert
 * @returns A Zod schema object with corresponding types
 */
export function jsonSchemaToZod (
  jsonSchema: unknown
): Record<string, z.ZodTypeAny> {
  // console.log('jsonSchema', jsonSchema);
  const inputJsonSchema = jsonSchema as JSONSchema
  // Extract properties from the JSON schema
  const properties = inputJsonSchema?.properties || {}
  const required = inputJsonSchema?.required || [] // 获取必填字段列表
  // Build a Zod schema object based on properties
  const schemaObject: Record<string, z.ZodTypeAny> = {}

  // Convert each property to a Zod type
  for (const [key, value] of Object.entries(properties)) {
    // Check if value is an object with a type property
    if (typeof value === 'object' && value !== null && 'type' in value) {
      const typedValue = value as JSONSchemaProperty

      // 创建基础类型的函数
      const createWithDefault = (zodType: z.ZodTypeAny) => {
        // 如果有默认值，添加默认值
        if ('default' in typedValue && typedValue.default !== undefined) {
          return zodType.default(typedValue.default)
        }
        return zodType
      }

      // Basic type mapping
      if (typedValue.type === 'string') {
        schemaObject[key] = createWithDefault(z.string())
      } else if (
        typedValue.type === 'number' ||
        typedValue.type === 'integer'
      ) {
        schemaObject[key] = createWithDefault(z.number())
      } else if (typedValue.type === 'boolean') {
        schemaObject[key] = createWithDefault(z.boolean())
      } else if (typedValue.type === 'array') {
        // Handle array type if the items property exists
        const items = typedValue.items
        if (items && typeof items === 'object' && 'type' in items) {
          let arrayType: z.ZodArray<any>

          if (items.type === 'string') {
            arrayType = z.array(z.string())
          } else if (items.type === 'number' || items.type === 'integer') {
            arrayType = z.array(z.number())
          } else if (items.type === 'boolean') {
            arrayType = z.array(z.boolean())
          } else {
            arrayType = z.array(z.any())
          }

          // 处理数组的默认值
          schemaObject[key] = createWithDefault(arrayType)
        } else {
          schemaObject[key] = createWithDefault(z.array(z.any()))
        }
      } else if (typedValue.type === 'object') {
        // Handle nested objects
        const nestedProperties = (value as JSONSchema).properties
        if (nestedProperties && typeof nestedProperties === 'object') {
          const nestedSchema = jsonSchemaToZod({ properties: nestedProperties })
          const objectType = z.object(nestedSchema)
          schemaObject[key] = createWithDefault(objectType)
        } else {
          schemaObject[key] = createWithDefault(z.record(z.string(), z.any()))
        }
      } else {
        // Default to any for unknown types
        schemaObject[key] = createWithDefault(z.any())
      }
    } else {
      // Default to any for values without a type
      schemaObject[key] = z.any()
    }
  }

  // 在返回之前，处理必填字段
  for (const key in schemaObject) {
    if (!required.includes(key)) {
      schemaObject[key] = schemaObject[key].optional()
    }
  }

  return schemaObject
}
