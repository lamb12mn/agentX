import { EventEmitter } from 'events';

import { listAssets, getAsset, createAsset, updateAsset, deleteAsset, batchDeleteAssets, batchAddTags, batchRemoveTags } from '../store/assets.js';
import { getStats } from '../store/pagination.js';
import { getBaseDir } from '../cli/common.js';

/** REST API 服务器配置 */
export interface APIConfig {
  /** 监听端口 */
  port: number;
  /** 监听地址 */
  host: string;
  /** 是否启用 CORS */
  cors: boolean;
  /** 速率限制配置 */
  rateLimit: {
    /** 时间窗口（毫秒） */
    windowMs: number;
    /** 窗口内最大请求数 */
    max: number;
  };
  /** API 认证密钥 */
  apiKey?: string;
}

/** REST API 响应格式 */
export interface APIResponse<T = any> {
  /** 是否成功 */
  success: boolean;
  /** 响应数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
  /** 提示信息 */
  message?: string;
}

/** REST API 请求格式 */
export interface APIRequest {
  /** HTTP 方法 */
  method: string;
  /** 请求路径 */
  path: string;
  /** 查询参数 */
  query: Record<string, string>;
  /** 请求体 */
  body: any;
  /** 请求头 */
  headers: Record<string, string>;
}

/** 中间件函数签名 */
export interface Middleware {
  (req: APIRequest, res: APIResponse, next: () => void): void;
}

/** REST API 服务器 */
export class RESTAPI extends EventEmitter {
  private config: APIConfig;
  private routes: Map<string, Map<string, Function>> = new Map();
  private middlewares: Middleware[] = [];
  private isRunning: boolean = false;
  private requestCount: number = 0;
  private windowStart: number = Date.now();

  constructor(config: Partial<APIConfig> = {}) {
    super();
    this.config = {
      port: 3000,
      host: 'localhost',
      cors: true,
      rateLimit: {
        windowMs: 60 * 1000, // 1 minute
        max: 100,
      },
      ...config,
    };
  }

  /**
   * 启动API服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('API server is already running');
    }

    // 注册认证中间件（如果配置了 API key）
    const apiKey = this.config.apiKey || process.env.AGENTX_API_KEY;
    if (apiKey) {
      this.addAuthMiddleware(apiKey);
    }

    // 注册默认路由
    this.registerDefaultRoutes();

    this.isRunning = true;
    this.emit('start', { port: this.config.port, host: this.config.host });
    
    console.log(`REST API server started on http://${this.config.host}:${this.config.port}`);
  }

  /**
   * 停止API服务器
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    this.emit('stop');
    console.log('REST API server stopped');
  }

  /**
   * 注册路由
   */
  registerRoute(method: string, path: string, handler: Function): void {
    const normalizedMethod = method.toUpperCase();
    
    if (!this.routes.has(normalizedMethod)) {
      this.routes.set(normalizedMethod, new Map());
    }
    
    this.routes.get(normalizedMethod)!.set(path, handler);
    this.emit('routeRegistered', { method: normalizedMethod, path });
  }

  /**
   * 注册中间件
   */
  use(middleware: Middleware): void {
    this.middlewares.push(middleware);
    this.emit('middlewareAdded', middleware);
  }

  /**
   * 处理请求
   */
  async handleRequest(req: APIRequest): Promise<APIResponse> {
    // 速率限制检查
    if (!this.checkRateLimit()) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        message: 'Too many requests, please try again later',
      };
    }

    // 执行中间件
    for (const middleware of this.middlewares) {
      await new Promise<void>((resolve, _reject) => {
        middleware(req, {} as APIResponse, () => resolve());
      });
    }

    // 查找匹配的路由
    const handler = this.findHandler(req.method, req.path);
    
    if (!handler) {
      return {
        success: false,
        error: 'Not Found',
        message: `No route found for ${req.method} ${req.path}`,
      };
    }

    try {
      const result = await handler(req);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 查找处理程序
   */
  private findHandler(method: string, path: string): Function | null {
    const normalizedMethod = method.toUpperCase();
    const methodRoutes = this.routes.get(normalizedMethod);
    
    if (!methodRoutes) return null;

    // 精确匹配
    if (methodRoutes.has(path)) {
      return methodRoutes.get(path)!;
    }

    // 模式匹配（支持参数）
    for (const [routePath, handler] of methodRoutes) {
      if (this.matchPattern(routePath, path)) {
        return handler;
      }
    }

    return null;
  }

  /**
   * 模式匹配
   */
  private matchPattern(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    
    if (patternParts.length !== pathParts.length) return false;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) continue; // 参数占位符
      if (patternParts[i] !== pathParts[i]) return false;
    }

    return true;
  }

  /**
   * 注册默认路由
   */
  private registerDefaultRoutes(): void {
    // 健康检查
    this.registerRoute('GET', '/health', () => ({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
    }));

    // 资产相关路由
    this.registerRoute('GET', '/api/assets', async (req: any) => {
      const assets = await listAssets(req.query?.type);
      return { assets, total: assets.length };
    });

    this.registerRoute('GET', '/api/assets/:id', async (req: any) => {
      const id = req.path.split('/').pop();
      const asset = await getAsset(id);
      return { asset };
    });

    this.registerRoute('POST', '/api/assets', async (req: any) => {
      const baseDir = getBaseDir();
      const { body } = req;
      const input = { name: body.name, type: body.type, description: body.description, tags: body.tags ?? [] };
      const asset = await createAsset(input, body.content ?? '', baseDir);
      return { asset };
    });

    this.registerRoute('PUT', '/api/assets/:id', async (req: any) => {
      const id = req.path.split('/').pop();
      const asset = await updateAsset(id, req.body);
      return { asset };
    });

    this.registerRoute('DELETE', '/api/assets/:id', async (req: any) => {
      const id = req.path.split('/').pop();
      await deleteAsset(id);
      return { success: true };
    });

    // 分页查询
    this.registerRoute('GET', '/api/assets/paginated', async (req: any) => {
      const all = await listAssets(req.query?.type);
      const page = parseInt(req.query?.page ?? '1', 10);
      const pageSize = parseInt(req.query?.pageSize ?? '20', 10);
      const start = (page - 1) * pageSize;
      const data = all.slice(start, start + pageSize);
      const total = all.length;
      return {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNextPage: start + pageSize < total,
          hasPrevPage: page > 1,
        },
      };
    });

    // 批量操作
    this.registerRoute('POST', '/api/assets/batch/delete', async (req: any) => {
      const result = await batchDeleteAssets(req.body.ids ?? [], { force: req.body.force });
      return result;
    });

    this.registerRoute('POST', '/api/assets/batch/tags/add', async (req: any) => {
      const result = await batchAddTags(req.body.ids ?? [], req.body.tags ?? []);
      return result;
    });

    this.registerRoute('POST', '/api/assets/batch/tags/remove', async (req: any) => {
      const result = await batchRemoveTags(req.body.ids ?? [], req.body.tags ?? []);
      return result;
    });

    // 工作流相关路由
    this.registerRoute('GET', '/api/workflows', async () => {
      const workflows = await listAssets('workflow');
      return { workflows };
    });

    this.registerRoute('POST', '/api/workflows/execute', async (req: any) => {
      return { execution: { id: req.body?.workflowId, status: 'pending', message: 'Execution not yet implemented' } };
    });

    // 统计信息
    this.registerRoute('GET', '/api/stats', async () => {
      const stats = await getStats();
      return stats;
    });

    // 缓存统计
    this.registerRoute('GET', '/api/cache/stats', async () => {
      return { hitRate: 0, size: 0, message: 'Cache stats available in enhanced mode only' };
    });
  }

  /**
   * 检查速率限制
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    
    if (now - this.windowStart >= this.config.rateLimit.windowMs) {
      this.windowStart = now;
      this.requestCount = 0;
    }

    this.requestCount++;
    
    return this.requestCount <= this.config.rateLimit.max;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      routes: this.routes.size,
      requestCount: this.requestCount,
      rateLimit: {
        remaining: Math.max(0, this.config.rateLimit.max - this.requestCount),
        resetIn: this.config.rateLimit.windowMs - (Date.now() - this.windowStart),
      },
    };
  }

  /**
   * 添加CORS中间件
   */
  addCorsMiddleware(): void {
    this.use((_req, _res, next) => {
      // 在实际实现中，这里会设置CORS头
      next();
    });
  }

  /**
   * 添加日志中间件
   */
  addLoggingMiddleware(): void {
    this.use((req, _res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * 添加身份验证中间件
   * @param apiKey 预期的 API key（Bearer token）
   * @param publicPaths 不需要认证的路径前缀列表
   */
  addAuthMiddleware(apiKey: string, publicPaths: string[] = ['/health']): void {
    this.use((req, _res, next) => {
      // 公开路径跳过认证
      if (publicPaths.some(p => req.path.startsWith(p))) {
        next();
        return;
      }
      const authHeader = req.headers['authorization'];
      if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
        throw new Error('Unauthorized');
      }
      next();
    });
  }

  /**
   * 获取认证状态
   */
  isAuthEnabled(): boolean {
    return this.middlewares.length > 0;
  }
}
