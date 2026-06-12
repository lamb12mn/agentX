import { EventEmitter } from 'events';
import type { AssetMeta, AssetType } from '../types.js';
import type { PaginatedResult } from '../types/pagination.js';

export interface APIConfig {
  port: number;
  host: string;
  cors: boolean;
  rateLimit: {
    windowMs: number;
    max: number;
  };
  apiKey?: string;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface APIRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  body: any;
  headers: Record<string, string>;
}

export interface Middleware {
  (req: APIRequest, res: APIResponse, next: () => void): void;
}

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
      await new Promise<void>((resolve, reject) => {
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
    this.registerRoute('GET', '/api/assets', async (req) => {
      // 这里应该调用实际的资产列表函数
      return { assets: [], total: 0 };
    });

    this.registerRoute('GET', '/api/assets/:id', async (req) => {
      // 这里应该调用实际的资产获取函数
      return { asset: null };
    });

    this.registerRoute('POST', '/api/assets', async (req) => {
      // 这里应该调用实际的资产创建函数
      return { asset: null };
    });

    this.registerRoute('PUT', '/api/assets/:id', async (req) => {
      // 这里应该调用实际的资产更新函数
      return { asset: null };
    });

    this.registerRoute('DELETE', '/api/assets/:id', async (req) => {
      // 这里应该调用实际的资产删除函数
      return { success: true };
    });

    // 分页查询
    this.registerRoute('GET', '/api/assets/paginated', async (req) => {
      // 这里应该调用实际的分页查询函数
      return {
        data: [],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    });

    // 批量操作
    this.registerRoute('POST', '/api/assets/batch/delete', async (req) => {
      // 这里应该调用实际的批量删除函数
      return { deleted: [], blocked: [], errors: [] };
    });

    this.registerRoute('POST', '/api/assets/batch/tags/add', async (req) => {
      // 这里应该调用实际的批量添加标签函数
      return { updated: [], errors: [] };
    });

    this.registerRoute('POST', '/api/assets/batch/tags/remove', async (req) => {
      // 这里应该调用实际的批量移除标签函数
      return { updated: [], errors: [] };
    });

    // 工作流相关路由
    this.registerRoute('GET', '/api/workflows', async () => {
      return { workflows: [] };
    });

    this.registerRoute('POST', '/api/workflows/execute', async (req) => {
      return { execution: null };
    });

    // 统计信息
    this.registerRoute('GET', '/api/stats', async () => {
      return {
        totalAssets: 0,
        assetsByType: {},
        recentActivity: 0,
      };
    });

    // 缓存统计
    this.registerRoute('GET', '/api/cache/stats', async () => {
      return {
        hitRate: 0,
        size: 0,
      };
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
    this.use((req, res, next) => {
      // 在实际实现中，这里会设置CORS头
      next();
    });
  }

  /**
   * 添加日志中间件
   */
  addLoggingMiddleware(): void {
    this.use((req, res, next) => {
      const start = Date.now();
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
    this.use((req, res, next) => {
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
