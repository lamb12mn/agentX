export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  main: string;
  author: string;
  api: string[];
  dependencies?: string[];
  hooks?: string[];
}

export interface PluginAPI {
  name: string;
  version: string;
  registerHook: (hook: string, handler: Function) => void;
  emitEvent: (event: string, data: any) => void;
  getPlugin: (name: string) => Plugin | undefined;
  getAllPlugins: () => Plugin[];
  callPluginMethod: (pluginName: string, method: string, ...args: any[]) => any;
}

export interface Plugin {
  manifest: PluginManifest;
  module: any;
  api: PluginAPI;
  enabled: boolean;
}

export interface PluginHookContext {
  plugin: string;
  data: any;
}
