<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Play, Square, RotateCw, Trash2, Box, Terminal, AlertCircle, Plus, Edit2 } from 'lucide-vue-next';
import StatusBadge from '../components/StatusBadge.vue';
import InstanceModal from '../components/InstanceModal.vue';
import NodeModal from '../components/NodeModal.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import type { Instance, MCPNode } from '../types';
import { apiClient } from '../api';

const route = useRoute();
const router = useRouter();
const instanceId = route.params.id as string;

const instance = ref<Instance | null>(null);
const activeTab = ref<'nodes' | 'logs' | 'config' | 'tools'>('nodes');
const showEditInstanceModal = ref(false);
const showNodeModal = ref(false);
const showDeleteInstanceModal = ref(false);
const showDeleteNodeModal = ref(false);
const nodeToDelete = ref<string | null>(null);
const currentNode = ref<MCPNode | null>(null);
const loading = ref(true);

const loadInstance = async () => {
  try {
    instance.value = await apiClient.getInstance(instanceId);
    
    // 如果实例在运行，加载实时节点状态
    if (instance.value && instance.value.status === 'running') {
      try {
        const nodes = await apiClient.getInstanceNodes(instanceId);
        instance.value.nodes = nodes;
      } catch (e) {
        console.warn('Failed to load real-time nodes status', e);
      }
    }
  } catch (error) {
    console.error('Failed to load instance:', error);
    alert('加载实例详情失败');
  } finally {
    loading.value = false;
  }
};

const logs = ref<any[]>([]);
const tools = ref<any[]>([]);

const loadLogs = async () => {
  try {
    logs.value = await apiClient.getInstanceLogs(instanceId);
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
};

const loadTools = async () => {
  try {
    tools.value = await apiClient.getInstanceTools(instanceId);
  } catch (error) {
    console.error('Failed to load tools:', error);
  }
};

// Watch tab change to load data
import { watch } from 'vue';
watch(activeTab, (newTab) => {
  if (newTab === 'logs') {
    loadLogs();
  } else if (newTab === 'tools') { // 假设有个 tools tab，虽然模板里还没写
    loadTools();
  } else if (newTab === 'nodes') {
    loadInstance();
  }
});

onMounted(() => {
  loadInstance();
});

const actionLoading = ref<Record<string, boolean>>({});

const handleAction = async (action: 'start' | 'stop' | 'restart' | 'delete') => {
  if (actionLoading.value[action]) return;

  if (action === 'delete') {
    showDeleteInstanceModal.value = true;
    return;
  }

  actionLoading.value[action] = true;
  try {
    if (action === 'start') await apiClient.startInstance(instanceId);
    if (action === 'stop') await apiClient.stopInstance(instanceId);
    if (action === 'restart') await apiClient.restartInstance(instanceId);
    
    // 轮询状态更新
    let attempts = 0;
    const maxAttempts = 10;
    const checkStatus = async () => {
      if (!instance.value) return;
      const updated = await apiClient.getInstance(instanceId);
      instance.value.status = updated.status;
      
      // 如果状态符合预期或超时，停止轮询
      const expectedStatus = action === 'stop' ? 'stopped' : 'running';
      if (updated.status === expectedStatus || attempts >= maxAttempts) {
        // 如果是 running，加载节点状态
        if (updated.status === 'running') {
            loadInstance(); 
        }
      } else {
        attempts++;
        setTimeout(checkStatus, 1000);
      }
    };
    setTimeout(checkStatus, 500);

  } catch (error) {
    console.error(`Failed to ${action} instance:`, error);
    alert('操作失败');
  } finally {
    actionLoading.value[action] = false;
  }
};

const handleConfirmDeleteInstance = async () => {
  actionLoading.value['delete'] = true;
  try {
    await apiClient.deleteInstance(instanceId);
    showDeleteInstanceModal.value = false;
    router.push('/');
  } catch (error) {
    console.error('Failed to delete instance:', error);
    alert('删除失败');
  } finally {
    actionLoading.value['delete'] = false;
  }
};

const handleEditInstance = () => {
  showEditInstanceModal.value = true;
};

const handleSaveInstance = async (data: any) => {
  if (!instance.value) return;
  try {
    await apiClient.updateInstance(instanceId, {
      name: data.name,
      accessAddress: data.accessAddress,
      // 保留其他字段
      nodes: instance.value.nodes
    });
    showEditInstanceModal.value = false;
    await loadInstance();
  } catch (error) {
    console.error('Failed to update instance:', error);
    alert('更新实例失败');
  }
};

const handleAddNode = () => {
  currentNode.value = null;
  showNodeModal.value = true;
};

const handleEditNode = (node: MCPNode) => {
  currentNode.value = node;
  showNodeModal.value = true;
};

const handleDeleteNode = (nodeId: string) => {
  nodeToDelete.value = nodeId;
  showDeleteNodeModal.value = true;
};

const handleConfirmDeleteNode = async () => {
  if (!instance.value || !nodeToDelete.value) return;
  
  actionLoading.value[`delete_node_${nodeToDelete.value}`] = true;
  try {
    const updatedNodes = instance.value.nodes.filter(n => n.id !== nodeToDelete.value);
    await apiClient.updateInstance(instanceId, {
      nodes: updatedNodes
    });
    showDeleteNodeModal.value = false;
    nodeToDelete.value = null;
    await loadInstance();
  } catch (error) {
    console.error('Failed to delete node:', error);
    alert('删除节点失败');
  } finally {
    if (nodeToDelete.value) actionLoading.value[`delete_node_${nodeToDelete.value}`] = false;
  }
};

const handleSaveNode = async (data: any) => {
  if (!instance.value) return;

  try {
    let updatedNodes = [...instance.value.nodes];
    
    // 智能拆分参数，支持引号包裹
    const parseArgs = (str: string) => {
      if (!str) return [];
      const regex = /[^\s"]+|"([^"]*)"/g;
      const args = [];
      let match;
      while ((match = regex.exec(str)) !== null) {
        args.push(match[1] ? match[1] : match[0]);
      }
      return args;
    };

    const args = data.args ? parseArgs(data.args) : [];

    if (data.id) {
      // Edit
      const index = updatedNodes.findIndex(n => n.id === data.id);
      if (index !== -1) {
        updatedNodes[index] = { ...updatedNodes[index], ...data, args };
      }
    } else {
      // Create
      const newNode: MCPNode = {
        id: Date.now().toString(),
        name: data.name,
        type: data.type,
        url: data.url,
        command: data.command,
        args: args,
        env: data.env || {}, 
        toolsCount: 0,
        resourcesCount: 0,
        promptsCount: 0,
        status: 'disconnected',
        lastHeartbeat: '-'
      };
      updatedNodes.push(newNode);
    }

    await apiClient.updateInstance(instanceId, {
      nodes: updatedNodes
    });
    showNodeModal.value = false;
    await loadInstance();
  } catch (error) {
    console.error('Failed to save node:', error);
    alert('保存节点失败');
  }
};
</script>

<template>
  <div v-if="instance" class="p-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="mb-6">
      <button 
        @click="router.back()" 
        class="flex items-center text-gray-500 hover:text-gray-900 mb-4 transition-colors"
      >
        <ArrowLeft class="w-4 h-4 mr-1" /> 返回列表
      </button>
      
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="w-full md:w-auto">
          <div class="flex items-center gap-3 mb-2 flex-wrap">
            <h1 class="text-2xl font-bold text-gray-900 truncate max-w-[200px] md:max-w-md">{{ instance.name }}</h1>
            <StatusBadge :status="instance.status" />
            <button @click="handleEditInstance" class="text-gray-400 hover:text-blue-600 transition-colors">
              <Edit2 class="w-4 h-4" />
            </button>
          </div>
          <p class="text-gray-500 font-mono text-sm truncate max-w-xs md:max-w-xl" :title="instance.accessAddress">{{ instance.accessAddress }}</p>
        </div>

        <div class="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 w-full md:w-auto">
          <button 
            v-if="instance.status === 'stopped'"
            @click="handleAction('start')"
            :disabled="actionLoading['start']"
            class="flex items-center justify-center px-3 py-2 bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            <div v-if="actionLoading['start']" class="animate-spin rounded-full h-4 w-4 border-b-2 border-green-700 mr-2"></div>
            <Play v-else class="w-4 h-4 mr-2" /> 
            {{ actionLoading['start'] ? '启动中...' : '启动' }}
          </button>
          
          <button 
            v-if="instance.status === 'running'"
            @click="handleAction('restart')"
            :disabled="actionLoading['restart']"
            class="flex items-center justify-center px-3 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            <div v-if="actionLoading['restart']" class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
            <RotateCw v-else class="w-4 h-4 mr-2" /> 
            {{ actionLoading['restart'] ? '重启中...' : '重启' }}
          </button>

          <button 
            v-if="instance.status === 'running'"
            @click="handleAction('stop')"
            :disabled="actionLoading['stop']"
            class="flex items-center justify-center px-3 py-2 bg-yellow-50 text-yellow-700 rounded-md hover:bg-yellow-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            <div v-if="actionLoading['stop']" class="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-700 mr-2"></div>
            <Square v-else class="w-4 h-4 mr-2" /> 
            {{ actionLoading['stop'] ? '停止中...' : '停止' }}
          </button>

          <button 
            @click="handleAction('delete')"
            :disabled="actionLoading['delete']"
            class="flex items-center justify-center px-3 py-2 bg-red-50 text-red-700 rounded-md hover:bg-red-100 transition-colors sm:ml-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            <div v-if="actionLoading['delete']" class="animate-spin rounded-full h-4 w-4 border-b-2 border-red-700 mr-2"></div>
            <Trash2 v-else class="w-4 h-4 mr-2" /> 
            {{ actionLoading['delete'] ? '删除中...' : '删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 overflow-x-auto scrollbar-hide">
      <nav class="-mb-px flex space-x-8 min-w-max" aria-label="Tabs">
        <button
          v-for="tab in ['nodes', 'logs', 'config', 'tools']"
          :key="tab"
          @click="activeTab = tab as any"
          :class="[
            activeTab === tab
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
            'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize'
          ]"
        >
          {{ tab === 'nodes' ? '节点列表' : tab === 'logs' ? '运行日志' : tab === 'config' ? '配置信息' : '工具链' }}
        </button>
      </nav>
    </div>

    <!-- Content -->
    <div class="py-6">
      <!-- Nodes Tab -->
      <div v-if="activeTab === 'nodes'">
        <div class="flex justify-end mb-4">
          <button
            @click="handleAddNode"
            class="flex items-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            <Plus class="w-4 h-4 mr-2" />
            添加节点
          </button>
        </div>
        
        <!-- Desktop Table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">节点 ID</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名称</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">类型</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">连接/命令</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最后心跳</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="node in instance.nodes" :key="node.id">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ node.id }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{{ (node as any).name || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span :class="[
                    'px-2 inline-flex text-xs leading-5 font-semibold rounded-full',
                    node.type === 'sse' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                  ]">
                    {{ node.type.toUpperCase() }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs" :title="node.type === 'sse' ? node.url : node.command">
                  {{ node.type === 'sse' ? node.url : node.command }}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <StatusBadge :status="node.status" type="node" />
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ node.lastHeartbeat }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="handleEditNode(node)" class="text-blue-600 hover:text-blue-900 mr-4">编辑</button>
                  <button @click="handleDeleteNode(node.id)" class="text-red-600 hover:text-red-900">删除</button>
                </td>
              </tr>
              <tr v-if="instance.nodes.length === 0">
                <td colspan="6" class="px-6 py-12 text-center text-gray-500 text-sm">
                  暂无节点，请添加一个 MCP Server 节点
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Cards -->
        <div class="md:hidden space-y-4">
          <div v-for="node in instance.nodes" :key="node.id" class="bg-white p-4 rounded-lg shadow border border-gray-200">
            <div class="flex justify-between items-start mb-3">
               <div>
                  <h3 class="text-sm font-medium text-gray-900">{{ (node as any).name || node.id }}</h3>
                  <div class="mt-1 flex items-center space-x-2">
                    <span :class="[
                      'px-2 inline-flex text-xs leading-5 font-semibold rounded-full',
                      node.type === 'sse' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                    ]">
                      {{ node.type.toUpperCase() }}
                    </span>
                    <StatusBadge :status="node.status" type="node" />
                  </div>
               </div>
               <div class="flex space-x-3">
                  <button @click="handleEditNode(node)" class="text-blue-600 hover:text-blue-900 text-sm">编辑</button>
                  <button @click="handleDeleteNode(node.id)" class="text-red-600 hover:text-red-900 text-sm">删除</button>
               </div>
            </div>
            
            <div class="space-y-2 text-sm text-gray-500">
               <div class="truncate" :title="node.type === 'sse' ? node.url : node.command">
                  <span class="font-medium text-gray-700">命令/URL:</span> {{ node.type === 'sse' ? node.url : node.command }}
               </div>
               <div>
                  <span class="font-medium text-gray-700">最后心跳:</span> {{ node.lastHeartbeat }}
               </div>
            </div>
          </div>
          <div v-if="instance.nodes.length === 0" class="text-center py-8 text-gray-500 bg-white rounded-lg border border-dashed border-gray-300">
             暂无节点，请添加一个 MCP Server 节点
          </div>
        </div>
      </div>

      <!-- Logs Tab -->
      <div v-else-if="activeTab === 'logs'" class="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-300 h-96 overflow-y-auto">
        <div v-if="logs.length === 0" class="text-center text-gray-500 py-12">暂无日志</div>
        <div v-for="(log, i) in logs" :key="i" class="mb-1">
          <span class="text-gray-500">[{{ new Date(log.timestamp).toLocaleTimeString() }}]</span>
          <span :class="{
            'text-green-400': log.level === 'INFO',
            'text-yellow-400': log.level === 'WARN',
            'text-red-400': log.level === 'ERROR',
            'text-blue-400': log.level === 'DEBUG'
          }" class="mx-2">[{{ log.level }}]</span>
          <span class="text-gray-400">[{{ log.category }}]</span>
          <span class="ml-2">{{ log.message }}</span>
        </div>
      </div>

      <!-- Config Tab -->
      <div v-else-if="activeTab === 'config'" class="bg-gray-50 rounded-lg p-6">
        <pre class="whitespace-pre-wrap font-mono text-sm text-gray-700">{{ JSON.stringify(instance, null, 2) }}</pre>
      </div>

      <!-- Tools Tab -->
      <div v-else-if="activeTab === 'tools'">
         <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           <div v-for="tool in tools" :key="tool.name" class="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
             <div class="flex items-center justify-between mb-2">
               <h3 class="font-bold text-gray-900 truncate" :title="tool.name">{{ tool.name }}</h3>
               <span v-if="tool.needsClient" class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Remote</span>
             </div>
             <p class="text-sm text-gray-500 line-clamp-3 mb-3">{{ tool.description || '暂无描述' }}</p>
             <!-- <button class="text-xs text-blue-600 hover:text-blue-800 font-medium">调用工具</button> -->
           </div>
           <div v-if="tools.length === 0" class="col-span-full text-center py-12 text-gray-500">
             暂无可用工具
           </div>
         </div>
      </div>
    </div>

    <!-- Modals -->
    <InstanceModal
      :show="showEditInstanceModal"
      :instance="instance"
      @close="showEditInstanceModal = false"
      @save="handleSaveInstance"
    />

    <NodeModal
      :show="showNodeModal"
      :node="currentNode"
      @close="showNodeModal = false"
      @save="handleSaveNode"
    />

    <ConfirmModal
      :show="showDeleteInstanceModal"
      title="删除实例"
      message="确定要删除该实例吗？此操作不可逆。"
      :loading="actionLoading['delete']"
      @close="showDeleteInstanceModal = false"
      @confirm="handleConfirmDeleteInstance"
    />

    <ConfirmModal
      :show="showDeleteNodeModal"
      title="删除节点"
      message="确定要删除该节点吗？"
      :loading="nodeToDelete ? actionLoading[`delete_node_${nodeToDelete}`] : false"
      @close="showDeleteNodeModal = false"
      @confirm="handleConfirmDeleteNode"
    />
  </div>
  
  <div v-else class="flex items-center justify-center h-screen">
    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
</template>
