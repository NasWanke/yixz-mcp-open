// 定义日志级别枚举
export enum LogLevel {
  TRACE = 'TRACE',   // 最详细的日志级别
  DEBUG = 'DEBUG',   // 调试信息
  INFO = 'INFO',     // 一般信息
  WARN = 'WARN',     // 警告信息
  ERROR = 'ERROR',   // 错误信息
  FATAL = 'FATAL',   // 致命错误
  OUTPUT = 'OUTPUT'  // 终端交互输出
}

// 定义日志分类
export enum LogCategory {
  SERVER = 'SERVER',           // 服务器相关
  CONFIG = 'CONFIG',           // 配置相关
  CONNECTION = 'CONNECTION',   // 连接相关
  TOOL = 'TOOL',              // 工具相关
  SESSION = 'SESSION',        // 会话相关
  SYSTEM = 'SYSTEM',          // 系统相关
  INTERACTIVE = 'INTERACTIVE' // 交互相关
}

// 日志颜色配置
const LOG_COLORS = {
  [LogLevel.TRACE]: '\x1b[90m',  // 灰色
  [LogLevel.DEBUG]: '\x1b[36m',  // 青色
  [LogLevel.INFO]: '\x1b[32m',   // 绿色
  [LogLevel.WARN]: '\x1b[33m',   // 黄色
  [LogLevel.ERROR]: '\x1b[31m',  // 红色
  [LogLevel.FATAL]: '\x1b[35m',  // 紫色
  [LogLevel.OUTPUT]: '\x1b[37m', // 白色
  RESET: '\x1b[0m'               // 重置颜色
}

// 日志级别权重
const LOG_LEVEL_WEIGHT = {
  [LogLevel.TRACE]: 0,
  [LogLevel.DEBUG]: 1,
  [LogLevel.INFO]: 2,
  [LogLevel.WARN]: 3,
  [LogLevel.ERROR]: 4,
  [LogLevel.FATAL]: 5,
  [LogLevel.OUTPUT]: 6  // OUTPUT 级别最高，确保始终显示
}

// 日志配置
interface LogConfig {
  minLevel: LogLevel;
  showTimestamp: boolean;
  showCategory: boolean;
  showColors: boolean;
}

// 默认配置
const defaultConfig: LogConfig = {
  minLevel: LogLevel.INFO,
  showTimestamp: true,
  showCategory: true,
  showColors: true
}

let currentConfig: LogConfig = { ...defaultConfig }

// 设置日志配置
export const setLogConfig = (config: Partial<LogConfig>) => {
  currentConfig = { ...currentConfig, ...config }
}

// 日志回调类型
type LogCallback = (log: { level: LogLevel, category: LogCategory, message: string, timestamp: number, instanceId?: string }) => void;
const logCallbacks: LogCallback[] = [];

// 添加日志回调
export const addLogCallback = (cb: LogCallback) => {
  logCallbacks.push(cb);
}

// 格式化日志消息
const formatLogMessage = (
  level: LogLevel,
  category: LogCategory,
  message: string,
  instanceId?: string
): string => {
  const parts: string[] = []
  
  if (currentConfig.showTimestamp) {
    parts.push(`[${new Date().toISOString()}]`)
  }

  if (instanceId) {
    parts.push(`[Instance:${instanceId}]`)
  }
  
  if (currentConfig.showCategory) {
    parts.push(`[${category}]`)
  }
  
  parts.push(`[${level}]`)
  parts.push(`[McpServerComposer]`)
  parts.push(message)
  
  let formattedMessage = parts.join(' ')
  
  if (currentConfig.showColors) {
    formattedMessage = `${LOG_COLORS[level]}${formattedMessage}${LOG_COLORS.RESET}`
  }
  
  return formattedMessage
}

// 发送通知
const log = async (
  sendNotification: any,
  level: LogLevel,
  category: LogCategory,
  data: string
) => {
  if (sendNotification) {
    await sendNotification({
      method: 'notifications/message',
      params: {
        level,
        category,
        data,
        timestamp: new Date().getTime()
      }
    })
  }
}

// 主日志函数
export const formatLog = async (
  level: LogLevel,
  message: string,
  category: LogCategory = LogCategory.SYSTEM,
  sendNotification: any = null,
  instanceId?: string // 添加 instanceId 参数
): Promise<string> => {
  // 检查日志级别（OUTPUT 级别始终显示）
  if (level !== LogLevel.OUTPUT && LOG_LEVEL_WEIGHT[level] < LOG_LEVEL_WEIGHT[currentConfig.minLevel]) {
    return ''
  }

  // 去除换行
  const messageNew = message.replace(/\n/g, ' ')
  const logMessage = formatLogMessage(level, category, messageNew, instanceId)

  // 根据级别输出到控制台
  switch (level) {
    case LogLevel.TRACE:
    case LogLevel.DEBUG:
      console.debug(logMessage)
      break
    case LogLevel.INFO:
      console.log(logMessage)
      break
    case LogLevel.WARN:
      console.warn(logMessage)
      break
    case LogLevel.ERROR:
    case LogLevel.FATAL:
      console.error(logMessage)
      break
    case LogLevel.OUTPUT:
      // OUTPUT 级别使用 process.stdout.write 直接输出，不添加额外格式
      process.stdout.write(messageNew + '\n')
      break
  }

  // 触发回调
  logCallbacks.forEach(cb => cb({ level, category, message: messageNew, timestamp: Date.now(), instanceId }));

  // 发送通知
  if (sendNotification) {
    await log(sendNotification, level, category, messageNew)
  }

  return logMessage
}
