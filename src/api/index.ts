import type { Instance } from '../types';

const API_BASE = '/api';

export const apiClient = {
  async getInstances(): Promise<Instance[]> {
    const res = await fetch(`${API_BASE}/instances`);
    if (!res.ok) throw new Error('Failed to fetch instances');
    return res.json();
  },

  async getInstance(id: string): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances/${id}`);
    if (!res.ok) throw new Error('Failed to fetch instance');
    return res.json();
  },

  async createInstance(data: Partial<Instance>): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create instance');
    return res.json();
  },

  async updateInstance(id: string, data: Partial<Instance>): Promise<Instance> {
    const res = await fetch(`${API_BASE}/instances/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update instance');
    return res.json();
  },

  async deleteInstance(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/instances/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete instance');
  },

  async startInstance(instanceId: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minutes timeout
    try {
      const res = await fetch(`${API_BASE}/instances/${instanceId}/start`, {
        method: 'POST',
        signal: controller.signal
      });
      if (!res.ok) throw new Error('Failed to start instance');
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async stopInstance(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/instances/${id}/stop`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to stop instance');
  },

  async restartInstance(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/instances/${id}/restart`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to restart instance');
  },

  async getInstanceNodes(id: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/instances/${id}/nodes`);
    if (!res.ok) throw new Error('Failed to fetch instance nodes');
    return res.json();
  },

  async getInstanceLogs(id: string, level?: string): Promise<any[]> {
    const url = level
      ? `${API_BASE}/instances/${id}/logs?level=${level}`
      : `${API_BASE}/instances/${id}/logs`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch instance logs');
    return res.json();
  },

  async getInstanceTools(id: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/instances/${id}/tools`);
    if (!res.ok) throw new Error('Failed to fetch instance tools');
    return res.json();
  },
};
