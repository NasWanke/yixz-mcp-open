import fs from 'fs/promises';
import path from 'path';

export type InstanceStatus = 'running' | 'stopped' | 'error' | 'restarting';

export interface MCPNodeConfig {
  id: string;
  type: 'sse' | 'stdio';
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface InstanceConfig {
  id: string;
  name: string;
  description?: string;
  status: InstanceStatus;
  accessAddress?: string; // 生成的访问地址，如 wss://...
  nodes: MCPNodeConfig[];
  toolChains?: any[];
  tools?: string[];
  namespace?: string;
  autoReload?: boolean;
  logLevel?: string;
  createdAt: number;
  updatedAt: number;
}

const DATA_FILE = path.join(process.cwd(), 'api/data/instances.json');

export class InstanceStore {
  private instances: Map<string, InstanceConfig> = new Map();
  private loaded = false;

  async load() {
    try {
      const dir = path.dirname(DATA_FILE);
      await fs.mkdir(dir, { recursive: true });
      
      const data = await fs.readFile(DATA_FILE, 'utf-8');
      const json = JSON.parse(data);
      this.instances.clear();
      json.forEach((inst: InstanceConfig) => this.instances.set(inst.id, inst));
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error('Failed to load instances:', error);
      }
      // If file doesn't exist, start empty
    }
    this.loaded = true;
  }

  async save() {
    const data = JSON.stringify(Array.from(this.instances.values()), null, 2);
    await fs.writeFile(DATA_FILE, data, 'utf-8');
  }

  async getAll(): Promise<InstanceConfig[]> {
    if (!this.loaded) await this.load();
    return Array.from(this.instances.values());
  }

  async get(id: string): Promise<InstanceConfig | undefined> {
    if (!this.loaded) await this.load();
    return this.instances.get(id);
  }

  async add(config: Omit<InstanceConfig, 'createdAt' | 'updatedAt'>): Promise<InstanceConfig> {
    if (!this.loaded) await this.load();
    const now = Date.now();
    const newInstance: InstanceConfig = {
      ...config,
      createdAt: now,
      updatedAt: now
    };
    this.instances.set(newInstance.id, newInstance);
    await this.save();
    return newInstance;
  }

  async update(id: string, updates: Partial<InstanceConfig>): Promise<InstanceConfig | undefined> {
    if (!this.loaded) await this.load();
    const instance = this.instances.get(id);
    if (!instance) return undefined;

    const updatedInstance = {
      ...instance,
      ...updates,
      updatedAt: Date.now()
    };
    this.instances.set(id, updatedInstance);
    await this.save();
    return updatedInstance;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.loaded) await this.load();
    const deleted = this.instances.delete(id);
    if (deleted) await this.save();
    return deleted;
  }
}

export const instanceStore = new InstanceStore();
