<script setup lang="ts">
import { ref, watch } from 'vue';
import BaseModal from './BaseModal.vue';
import type { MCPNode } from '../types';

const props = defineProps<{
  show: boolean;
  node?: MCPNode | null;
}>();

const emit = defineEmits(['close', 'save']);

const form = ref({
  name: '',
  type: 'sse' as 'sse' | 'stdio',
  url: '',
  command: '',
  args: '',
  env: ''
});

const errors = ref({
  url: '',
  command: ''
});

const jsonConfig = ref('');
const jsonError = ref('');

// 重置表单到默认状态
const resetForm = () => {
  form.value = {
    name: '',
    type: 'sse',
    url: '',
    command: '',
    args: '',
    env: ''
  };
  errors.value = { url: '', command: '' };
  jsonConfig.value = '';
  jsonError.value = '';
};

// 监听节点变化（编辑模式）
watch(() => props.node, (newVal) => {
  if (newVal) {
    form.value = {
      name: newVal.name || '',
      type: newVal.type,
      url: newVal.url || '',
      command: newVal.command || '',
      args: Array.isArray(newVal.args) ? newVal.args.join(' ') : (newVal.args || ''),
      env: Object.entries(newVal.env || {}).map(([k, v]) => `${k}=${v}`).join('\n')
    };
  }
}, { immediate: true });

// 监听弹窗显示状态，每次打开时重置表单（仅用于添加新节点）
watch(() => props.show, (isShowing) => {
  if (isShowing && !props.node) {
    resetForm();
  }
});

const handleJsonPaste = () => {
  try {
    // 尝试清理 JSON 字符串（去除首尾的非 JSON 字符，如中文逗号等）
    let cleanedJson = jsonConfig.value.trim();
    // 如果首尾不是 {}，尝试提取
    const firstBrace = cleanedJson.indexOf('{');
    const lastBrace = cleanedJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanedJson = cleanedJson.substring(firstBrace, lastBrace + 1);
    }

    const config = JSON.parse(cleanedJson);
    const mcpServers = config.mcpServers;
    if (!mcpServers) {
      throw new Error('JSON 必须包含 "mcpServers" 字段');
    }

    const serverNames = Object.keys(mcpServers);
    if (serverNames.length === 0) {
      throw new Error('mcpServers 为空');
    }

    // 默认取第一个 server 配置
    const serverName = serverNames[0];
    const serverConfig = mcpServers[serverName];

    // 自动填充显示名称（使用 mcpServers 的键名）
    form.value.name = serverName;

    // 自动识别类型
    if (serverConfig.url) {
      form.value.type = 'sse';
      form.value.url = serverConfig.url.trim();
    } else if (serverConfig.command) {
      form.value.type = 'stdio';
      form.value.command = serverConfig.command;
      
      let argsStr = '';
      if (Array.isArray(serverConfig.args)) {
        // 如果是 npx 命令，自动添加 -y 参数以避免交互式提示
        if ((serverConfig.command === 'npx' || serverConfig.command.endsWith('npx')) && !serverConfig.args.includes('-y')) {
          argsStr = ['-y', ...serverConfig.args].join(' ');
        } else {
          argsStr = serverConfig.args.join(' ');
        }
      } else {
        argsStr = serverConfig.args || '';
      }
      form.value.args = argsStr;

      if (serverConfig.env) {
        form.value.env = Object.entries(serverConfig.env).map(([k, v]) => `${k}=${v}`).join('\n');
      }
    } else {
      throw new Error('配置缺少 url 或 command 字段');
    }

    // 如果有 header 认证信息，可能需要特殊处理，目前暂不支持在表单直接映射 headers
    // 可以在 env 中添加提示
    if (serverConfig.headers) {
       const headerEnv = Object.entries(serverConfig.headers).map(([k, v]) => `HEADER_${k}=${v}`).join('\n');
       form.value.env = form.value.env ? `${form.value.env}\n${headerEnv}` : headerEnv;
    }

    jsonError.value = '';
    // 清空 JSON 输入框
    jsonConfig.value = '';
    alert(`已成功导入节点配置: ${serverName}`);

  } catch (e) {
    jsonError.value = `解析失败: ${(e as Error).message}`;
  }
};

const validate = () => {
  let isValid = true;
  errors.value = { url: '', command: '' };

  if (form.value.type === 'sse') {
    if (!form.value.url.trim()) {
      errors.value.url = 'SSE URL 不能为空';
      isValid = false;
    } else if (!form.value.url.startsWith('http')) {
      errors.value.url = 'SSE URL 必须以 http/https 开头';
      isValid = false;
    }
  } else {
    if (!form.value.command.trim()) {
      errors.value.command = '执行命令不能为空';
      isValid = false;
    }
  }

  return isValid;
};

const handleSave = () => {
  if (!validate()) return;
  
  // Parse env string to object
  const envObj: Record<string, string> = {};
  if (form.value.env) {
    form.value.env.split('\n').forEach(line => {
      const [key, ...valParts] = line.split('=');
      if (key && valParts.length > 0) {
        envObj[key.trim()] = valParts.join('=').trim();
      }
    });
  }

  emit('save', { 
    ...form.value, 
    id: props.node?.id,
    env: envObj
  });
};
</script>

<template>
  <BaseModal
    :show="show"
    :title="node ? '编辑节点' : '添加节点'"
    @close="emit('close')"
  >
    <div class="space-y-4">
      <!-- JSON Import Section -->
      <div v-if="!node" class="bg-gray-50 p-3 rounded-md border border-gray-200">
        <label class="block text-sm font-medium text-gray-700 mb-2">快速导入配置 (JSON)</label>
        <textarea
          v-model="jsonConfig"
          rows="3"
          class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-xs border p-2 font-mono"
          placeholder='粘贴 JSON 配置，如 {"mcpServers": {...}}'
        ></textarea>
        <div class="flex justify-between items-center mt-2">
           <span class="text-xs text-red-500">{{ jsonError }}</span>
           <button 
             @click="handleJsonPaste"
             type="button"
             class="text-xs px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
             :disabled="!jsonConfig"
           >
             识别并填充
           </button>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-4">
        <label class="block text-sm font-medium text-gray-700">节点类型</label>
        <div class="mt-2 flex space-x-4">
          <label class="inline-flex items-center">
            <input type="radio" v-model="form.type" value="sse" class="form-radio text-blue-600">
            <span class="ml-2">SSE (HTTP)</span>
          </label>
          <label class="inline-flex items-center">
            <input type="radio" v-model="form.type" value="stdio" class="form-radio text-blue-600">
            <span class="ml-2">Stdio (Local Process)</span>
          </label>
        </div>
      </div>

      <!-- Common name field for both SSE and Stdio -->
      <div class="mt-4">
        <label class="block text-sm font-medium text-gray-700">显示名称（用于命名空间）</label>
        <input
          v-model="form.name"
          type="text"
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
          placeholder="如: howtocook-mcp"
        />
      </div>

      <div v-if="form.type === 'sse'">
        <label class="block text-sm font-medium text-gray-700">SSE URL</label>
        <input
          v-model="form.url"
          type="text"
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
          placeholder="http://localhost:3000/sse"
        />
        <p v-if="errors.url" class="mt-1 text-sm text-red-600">{{ errors.url }}</p>
      </div>

      <div v-else class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700">命令 (Command)</label>
          <input
            v-model="form.command"
            type="text"
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            placeholder="例如: npx, python, ./mcp-server"
          />
          <p v-if="errors.command" class="mt-1 text-sm text-red-600">{{ errors.command }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">参数 (Args)</label>
          <input
            v-model="form.args"
            type="text"
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            placeholder="空格分隔，如: -m mcp_server"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">环境变量 (Env)</label>
          <textarea
            v-model="form.env"
            rows="3"
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
            placeholder="KEY=VALUE (每行一个)"
          ></textarea>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        @click="handleSave"
        class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
      >
        {{ node ? '保存' : '添加' }}
      </button>
      <button
        @click="emit('close')"
        class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
      >
        取消
      </button>
    </template>
  </BaseModal>
</template>
