<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  status: string;
  type?: 'instance' | 'node';
}>();

const config = computed(() => {
  const s = props.status.toLowerCase();

  // Node status (removed type check to match all statuses)
  if (['connected', 'connecting', 'disconnected', 'error'].includes(s)) {
    switch (s) {
      case 'connected': return { color: 'bg-green-100 text-green-700', text: '已连接' };
      case 'connecting': return { color: 'bg-yellow-100 text-yellow-700', text: '连接中' };
      case 'disconnected': return { color: 'bg-gray-100 text-gray-700', text: '未连接' };
      case 'error': return { color: 'bg-red-100 text-red-700', text: '异常' };
      default: return { color: 'bg-gray-100 text-gray-700', text: s };
    }
  }

  // Instance status
  switch (s) {
    case 'running': return { color: 'bg-green-100 text-green-700', text: '运行中' };
    case 'stopped': return { color: 'bg-gray-100 text-gray-700', text: '已停止' };
    case 'error': return { color: 'bg-red-100 text-red-700', text: '异常' };
    case 'restarting': return { color: 'bg-blue-100 text-blue-700', text: '重启中' };
    default: return { color: 'bg-gray-100 text-gray-700', text: s };
  }
});
</script>

<template>
  <span 
    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0"
    :class="config.color"
  >
    {{ config.text }}
  </span>
</template>
