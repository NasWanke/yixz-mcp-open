<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import BaseModal from './BaseModal.vue';
import type { Instance } from '../types';

const props = defineProps<{
  show: boolean;
  instance?: Instance | null;
}>();

const emit = defineEmits(['close', 'save']);

const form = ref({
  name: '',
  accessAddress: '',
  autoReload: false,
  logLevel: 'INFO' as 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
});

const errors = ref({
  name: '',
  accessAddress: ''
});

// Watch for edit mode
watch(() => props.instance, (newVal) => {
  if (newVal) {
    form.value = {
      name: newVal.name,
      accessAddress: newVal.accessAddress,
      autoReload: false, // TODO: Add to Instance type
      logLevel: 'INFO' // TODO: Add to Instance type
    };
  } else {
    form.value = {
      name: '',
      accessAddress: '',
      autoReload: false,
      logLevel: 'INFO'
    };
  }
  errors.value = { name: '', accessAddress: '' };
}, { immediate: true });

const validate = () => {
  let isValid = true;
  errors.value = { name: '', accessAddress: '' };

  if (!form.value.name.trim()) {
    errors.value.name = '实例名称不能为空';
    isValid = false;
  }

  if (!form.value.accessAddress.trim()) {
    errors.value.accessAddress = '接入地址不能为空';
    isValid = false;
  } else if (!form.value.accessAddress.startsWith('wss://')) {
    errors.value.accessAddress = '接入地址必须以 wss:// 开头';
    isValid = false;
  } else if (!form.value.accessAddress.includes('token=')) {
    errors.value.accessAddress = '接入地址必须包含 token 参数';
    isValid = false;
  }

  return isValid;
};

const handleSave = () => {
  if (!validate()) return;
  emit('save', { ...form.value, id: props.instance?.id });
};
</script>

<template>
  <BaseModal
    :show="show"
    :title="instance ? '编辑实例' : '创建实例'"
    @close="emit('close')"
  >
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700">实例名称</label>
        <input
          v-model="form.name"
          type="text"
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
          placeholder="请输入实例名称"
        />
        <p v-if="errors.name" class="mt-1 text-sm text-red-600">{{ errors.name }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700">接入地址</label>
        <input
          v-model="form.accessAddress"
          type="text"
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
          placeholder="wss://api.xiaozhi.me/mcp/?token=..."
        />
        <p v-if="errors.accessAddress" class="mt-1 text-sm text-red-600">{{ errors.accessAddress }}</p>
        <p class="mt-1 text-xs text-gray-500">必须是 wss:// 协议且包含 token 参数</p>
      </div>

      <div class="flex items-center justify-between">
        <div class="flex items-center">
          <input
            v-model="form.autoReload"
            id="auto-reload"
            type="checkbox"
            class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label for="auto-reload" class="ml-2 block text-sm text-gray-900">
            自动重载
          </label>
        </div>

        <div class="flex items-center">
          <label class="block text-sm font-medium text-gray-700 mr-2">日志级别</label>
          <select
            v-model="form.logLevel"
            class="block w-24 pl-2 pr-8 py-1 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md border"
          >
            <option value="DEBUG">DEBUG</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
          </select>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        @click="handleSave"
        class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
      >
        {{ instance ? '保存' : '创建' }}
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
