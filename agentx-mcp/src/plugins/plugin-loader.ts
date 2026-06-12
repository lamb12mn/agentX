import { readdir, readFile, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import { createRequire } from 'module';
import { EventEmitter } from 'events';
import type { Plugin, PluginManifest, PluginAPI } from '../types/plugin.js';

export class PluginLoader extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private pluginDir: string;
  private require: NodeRequire;

  constructor(pluginDir: string) {
    super();
    this.pluginDir = pluginDir;
    this.require = createRequire(import.meta.url);
  }

  /**
   * 加载所有插件
   */
  async loadAll(): Promise<void> {
    try {
      const files = await readdir(this.pluginDir, { withFileTypes: true });
      
      for (const file of files) {
        if (file.isDirectory()) {
          await this.loadPluginFromDirectory(join(this.pluginDir, file.name));
        } else if (this.isPluginFile(file.name)) {
          await this.loadPluginFromFile(join(this.pluginDir, file.name));
        }
      }
      
      this.emit('pluginsLoaded', this.plugins.size);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 从目录加载插件
   */
  private async loadPluginFromDirectory(dirPath: string): Promise<void> {
    try {
      const manifestPath = join(dirPath, 'plugin.json');
      const manifest = await this.readManifest(manifestPath);
      
      if (!manifest) {
        throw new Error(`No plugin.json found in ${dirPath}`);
      }

      const mainFile = join(dirPath, manifest.main || 'index.js');
      const plugin = await this.createPlugin(manifest, mainFile);
      
      this.plugins.set(manifest.name, plugin);
      this.emit('pluginLoaded', manifest.name);
    } catch (error) {
      this.emit('pluginError', { dir: dirPath, error });
      throw error;
    }
  }

  /**
   * 从文件加载插件
   */
  private async loadPluginFromFile(filePath: string): Promise<void> {
    try {
      const manifestPath = filePath.replace(/\.(js|ts)$/, '.json');
      let manifest = await this.readManifest(manifestPath);
      
      if (!manifest) {
        // 如果没有manifest文件，从文件名推断
        const name = basename(filePath, extname(filePath));
        manifest = {
          name,
          version: '1.0.0',
          description: `Plugin: ${name}`,
          main: basename(filePath),
          author: 'Unknown',
          api: [],
        };
      }

      const plugin = await this.createPlugin(manifest, filePath);
      this.plugins.set(manifest.name, plugin);
      this.emit('pluginLoaded', manifest.name);
    } catch (error) {
      this.emit('pluginError', { file: filePath, error });
      throw error;
    }
  }

  /**
   * 读取插件清单
   */
  private async readManifest(path: string): Promise<PluginManifest | null> {
    try {
      await stat(path);
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * 创建插件实例
   */
  private async createPlugin(manifest: PluginManifest, mainFile: string): Promise<Plugin> {
    let pluginModule;
    
    try {
      // 动态导入插件模块
      if (mainFile.endsWith('.ts')) {
        // TypeScript文件需要编译
        pluginModule = await import(mainFile);
      } else {
        pluginModule = this.require(mainFile);
      }
    } catch (error) {
      throw new Error(`Failed to load plugin module: ${error instanceof Error ? error.message : String(error)}`);
    }

    const plugin: Plugin = {
      manifest,
      module: pluginModule,
      api: {} as PluginAPI,
      enabled: true,
    };

    // 初始化插件API
    await this.initializePluginAPI(plugin);

    return plugin;
  }

  /**
   * 初始化插件API
   */
  private async initializePluginAPI(plugin: Plugin): Promise<void> {
    const pluginAPI: PluginAPI = {
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      registerHook: (hook, handler) => {
        this.emit('hookRegistered', { plugin: plugin.manifest.name, hook });
        return this.on(hook, handler as (...args: any[]) => void);
      },
      emitEvent: (event, data) => {
        this.emit(event, { plugin: plugin.manifest.name, data });
      },
      getPlugin: (name) => {
        return this.plugins.get(name);
      },
      getAllPlugins: () => {
        return Array.from(this.plugins.values());
      },
      callPluginMethod: (pluginName, method, ...args) => {
        const targetPlugin = this.plugins.get(pluginName);
        if (!targetPlugin) {
          throw new Error(`Plugin not found: ${pluginName}`);
        }
        
        const methodFn = targetPlugin.module[method];
        if (typeof methodFn !== 'function') {
          throw new Error(`Method not found: ${method}`);
        }
        
        return methodFn.apply(targetPlugin.module, args);
      },
    };

    plugin.api = pluginAPI;

    // 调用插件的初始化方法（如果存在）
    if (typeof plugin.module.initialize === 'function') {
      await plugin.module.initialize(pluginAPI);
    }
  }

  /**
   * 获取插件
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 启用插件
   */
  enablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = true;
      this.emit('pluginEnabled', name);
      return true;
    }
    return false;
  }

  /**
   * 禁用插件
   */
  disablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = false;
      this.emit('pluginDisabled', name);
      return true;
    }
    return false;
  }

  /**
   * 卸载插件
   */
  unloadPlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      // 调用插件的清理方法（如果存在）
      if (typeof plugin.module.cleanup === 'function') {
        plugin.module.cleanup();
      }
      
      this.plugins.delete(name);
      this.emit('pluginUnloaded', name);
      return true;
    }
    return false;
  }

  /**
   * 重新加载插件
   */
  async reloadPlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return false;
    }

    const manifest = plugin.manifest;
    const mainFile = join(this.pluginDir, manifest.main);

    // 卸载旧插件
    this.unloadPlugin(name);

    // 重新加载
    await this.loadPluginFromFile(mainFile);
    return true;
  }

  /**
   * 检查是否是插件文件
   */
  private isPluginFile(filename: string): boolean {
    const ext = extname(filename);
    return ext === '.js' || ext === '.ts';
  }

  /**
   * 获取插件统计信息
   */
  getStats() {
    return {
      total: this.plugins.size,
      enabled: Array.from(this.plugins.values()).filter(p => p.enabled).length,
      disabled: Array.from(this.plugins.values()).filter(p => !p.enabled).length,
    };
  }
}
