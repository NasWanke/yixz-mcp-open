<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Server, Activity, Network } from 'lucide-vue-next';
import type { Instance } from '../types';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  instance: Instance;
}>();

const router = useRouter();

const nodeStatusSummary = computed(() => {
  const total = props.instance.nodes.length;
  const connected = props.instance.nodes.filter(n => n.status === 'connected').length;
  return `${connected}/${total} 正常`;
});

const goToDetail = () => {
  router.push(`/instance/${props.instance.id}`);
};
</script>

<template>
  <div 
    class="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5"
    @click="goToDetail"
  >
    <div class="flex justify-between items-start mb-4">
      <div class="flex items-center space-x-3">
        <div class="p-2 bg-blue-50 rounded-lg">
          <Server class="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h3 class="text-lg font-semibold text-gray-900">{{ instance.name }}</h3>
          <p class="text-sm text-gray-500 font-mono mt-0.5 truncate max-w-[200px]" :title="instance.accessAddress">{{ instance.accessAddress }}</p>
        </div>
      </div>
      <StatusBadge :status="instance.status" />
    </div>

    <div class="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
      <div class="flex flex-col">
        <span class="text-xs text-gray-500 flex items-center mb-1">
          <Network class="w-3 h-3 mr-1" /> 节点数量
        </span>
        <span class="text-sm font-medium">{{ instance.nodes.length }} 个节点</span>
      </div>
      <div class="flex flex-col">
        <span class="text-xs text-gray-500 flex items-center mb-1">
          <Activity class="w-3 h-3 mr-1" /> 节点状态
        </span>
        <span class="text-sm font-medium">{{ nodeStatusSummary }}</span>
      </div>
    </div>
  </div>
</template>
