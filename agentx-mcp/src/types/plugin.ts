/** 插件清单文件定义 */
export interface PluginManifest {
  /** 插件名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 插件描述 */
  description: string;
  /** 入口文件路径 */
  main: string;
  /** 作者 */
  author: string;
  /** 插件暴露的 API 名称列表 */
  api: string[];
  /** 依赖的插件名称列表 */
  dependencies?: string[];
  /** 注册的钩子名称列表 */
  hooks?: string[];
}

/** 插件运行时 API */
export interface PluginAPI {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 注册钩子处理函数 */
  registerHook: (hook: string, handler: Function) => void;
  /** 发送事件 */
  emitEvent: (event: string, data: any) => void;
  /** 获取指定插件实例 */
  getPlugin: (name: string) => Plugin | undefined;
  /** 获取所有已加载插件 */
  getAllPlugins: () => Plugin[];
  /** 调用其他插件的方法 */
  callPluginMethod: (pluginName: string, method: string, ...args: any[]) => any;
}

/** 插件实例 */
export interface Plugin {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 插件模块 */
  module: any;
  /** 插件运行时 API */
  api: PluginAPI;
  /** 是否启用 */
  enabled: boolean;
}

/** 插件钩子执行上下文 */
export interface PluginHookContext {
  /** 来源插件名称 */
  plugin: string;
  /** 钩子传递的数据 */
  data: any;
}
