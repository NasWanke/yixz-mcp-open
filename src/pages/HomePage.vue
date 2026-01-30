<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus } from 'lucide-vue-next';
import InstanceCard from '../components/InstanceCard.vue';
import InstanceModal from '../components/InstanceModal.vue';
import type { Instance } from '../types';
import { apiClient } from '../api';
import packageJson from '../../package.json';

const instances = ref<Instance[]>([]);
const showCreateModal = ref(false);
const loading = ref(false);
const version = packageJson.version;

const loadInstances = async () => {
  loading.value = true;
  try {
    instances.value = await apiClient.getInstances();
  } catch (error) {
    console.error('Failed to load instances:', error);
    alert('加载实例列表失败');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadInstances();
});

const handleCreate = () => {
  showCreateModal.value = true;
};

const handleSaveInstance = async (data: any) => {
  try {
    await apiClient.createInstance({
      name: data.name,
      accessAddress: data.accessAddress,
      // @ts-ignore
      nodes: [],
      // @ts-ignore
      status: 'stopped'
    });
    showCreateModal.value = false;
    await loadInstances();
  } catch (error) {
    console.error('Failed to create instance:', error);
    alert('创建实例失败');
  }
};
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-2xl font-bold text-gray-900">实例管理</h1>
          <span class="inline-flex items-center rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-medium">v{{ version }}</span>
        </div>
        <p class="text-gray-500 mt-1">管理您所有的 MCP 服务实例与节点状态</p>
      </div>
      <button 
        @click="handleCreate"
        class="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm w-full sm:w-auto"
      >
        <Plus class="w-5 h-5 mr-2" />
        新建实例
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <div v-else-if="instances.length === 0" class="text-center py-12 text-gray-500">
      暂无实例，请点击右上角新建
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <InstanceCard 
        v-for="inst in instances" 
        :key="inst.id" 
        :instance="inst" 
      />
    </div>

    <InstanceModal 
      :show="showCreateModal" 
      @close="showCreateModal = false"
      @save="handleSaveInstance"
    />
  </div>
</template>
