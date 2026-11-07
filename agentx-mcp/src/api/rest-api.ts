import { EventEmitter } from 'events';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { timingSafeEqual } from 'crypto';

import { listAssets, getAsset, createAsset, updateAsset, deleteAsset, batchDeleteAssets, batchAddTags, batchRemoveTags } from '../store/assets.js';
import { getStats } from '../store/pagination.js';
import { getCacheStats } from '../store/cache.js';
import { getBaseDir } from '../cli/common.js';
import { diag } from '../observability/diag.js';
import { executeWorkflowAsset } from '../orchestrator/workflow-runner.js';

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
  /** HTTP 状态码（由 HTTP 层使用，缺省 200/500） */
  statusCode?: number;
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

/** 路由处理函数签名 */
export type RouteHandler = (req: APIRequest) => unknown | Promise<unknown>;

/** 去除 Bearer 前缀（如存在） */
function stripBearer(value: string): string {
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length) : value;
}

/** REST API 服务器 */
export class RESTAPI extends EventEmitter {
  private config: APIConfig;
  private routes: Map<string, Map<string, RouteHandler>> = new Map();
  private middlewares: Middleware[] = [];
  private isRunning: boolean = false;
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private server: Server | null = null;
  /** 请求体大小上限（1MB），防止内存耗尽 */
  private static readonly MAX_BODY_BYTES = 1024 * 1024;

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

    // 注册默认路由
    this.registerDefaultRoutes();

    // 注册认证中间件（如配置了 API key 且尚未在外部注册）
    const apiKey = this.config.apiKey || process.env.AGENTX_API_KEY;
    if (apiKey && !this.isAuthEnabled()) {
      this.addAuthMiddleware(apiKey);
    }

    // 真正监听端口：此前 start() 只翻转标志位，api.start 属于假实现
    await new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        this.handleHttp(req, res).catch(() => {
          if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
        });
      });
      server.once('error', reject);
      server.listen(this.config.port, this.config.host, () => {
        server.removeListener('error', reject);
        this.server = server;
        resolve();
      });
    });

    this.isRunning = true;
    this.emit('start', { port: this.config.port, host: this.config.host });

    diag(`REST API server started on http://${this.config.host}:${this.config.port}`);
  }

  /**
   * 停止API服务器
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.server) {
      const server = this.server;
      this.server = null;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    this.emit('stop');
    diag('REST API server stopped');
  }

  /**
   * 注册路由
   */
  registerRoute(method: string, path: string, handler: RouteHandler): void {
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
        statusCode: 429,
        error: 'Rate limit exceeded',
        message: 'Too many requests, please try again later',
      };
    }

    // 执行中间件：中间件通过填充 res 并跳过 next() 来短路请求
    for (const middleware of this.middlewares) {
      const res: APIResponse = { success: true };
      let continued = false;
      await new Promise<void>((resolve) => {
        middleware(req, res, () => {
          continued = true;
          resolve();
        });
        // 中间件未调用 next() 即短路（如鉴权失败），必须手动释放 Promise，否则会挂死
        if (!continued) resolve();
      });
      if (!continued) {
        if (res.success) {
          // 中间件已生成完整响应（如 CORS 预检）
          return res;
        }
        return {
          success: false,
          statusCode: res.statusCode ?? 401,
          error: res.error ?? 'Unauthorized',
          ...(res.message ? { message: res.message } : {}),
        };
      }
    }

    // 查找匹配的路由
    const handler = this.findHandler(req.method, req.path);
    
    if (!handler) {
      return {
        success: false,
        statusCode: 404,
        error: 'Not Found',
        message: `No route found for ${req.method} ${req.path}`,
      };
    }

    try {
      const result = await handler(req);
      return {
        success: true,
        statusCode: 200,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 查找处理程序
   */
  private findHandler(method: string, path: string): RouteHandler | null {
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
      const input = req.body?.input;
      if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input))) {
        throw new Error('input must be a JSON object');
      }
      const execution = await executeWorkflowAsset(req.body?.workflowId, input ?? {}, {
        timeout: req.body?.timeout,
      });
      return { execution };
    });

    // 统计信息
    this.registerRoute('GET', '/api/stats', async () => {
      const stats = await getStats();
      return stats;
    });

    // 缓存统计
    this.registerRoute('GET', '/api/cache/stats', async () => {
      return getCacheStats();
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
      // CORS 响应头由 HTTP 层（sendHttp）在 config.cors 开启时统一设置
      next();
    });
  }

  /**
   * 添加日志中间件
   */
  addLoggingMiddleware(): void {
    this.use((req, _res, next) => {
      diag(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * 添加身份验证中间件
   * @param apiKey 预期的 API key（Authorization: Bearer 或 X-API-Key 头）
   * @param publicPaths 不需要认证的路径前缀列表
   */
  addAuthMiddleware(apiKey: string, publicPaths: string[] = ['/health']): void {
    this.use((req, res, next) => {
      // 公开路径跳过认证
      if (publicPaths.some(p => req.path.startsWith(p))) {
        next();
        return;
      }
      // remote 客户端使用 X-API-Key，REST 调用方常用 Bearer token，两者都接受
      const provided = req.headers['x-api-key'] ?? req.headers['authorization'] ?? '';
      if (!this.secureCompare(provided, apiKey) && !this.secureCompare(stripBearer(provided), apiKey)) {
        res.success = false;
        res.statusCode = 401;
        res.error = 'Unauthorized';
        return;
      }
      next();
    });
  }

  /** timing-safe 字符串比较，避免旁路时序泄露 */
  private secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * HTTP 层：将 node:http 请求映射为 APIRequest / APIResponse
   */
  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.config.cors) {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type,authorization,x-api-key');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? this.config.host}`);
    let body: unknown = {};
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await this.readBody(req);
      if (body === null) {
        this.sendHttp(res, { success: false, statusCode: 413, error: 'Payload too large' });
        return;
      }
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key.toLowerCase()] = value;
      else if (Array.isArray(value)) headers[key.toLowerCase()] = value.join(',');
    }

    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) query[key] = value;

    const apiRes = await this.handleRequest({
      method: req.method ?? 'GET',
      path: url.pathname,
      query,
      body,
      headers,
    });
    this.sendHttp(res, apiRes);
  }

  /** 读取并限制请求体大小；超限返回 null */
  private readBody(req: IncomingMessage): Promise<unknown | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > RESTAPI.MAX_BODY_BYTES) {
          req.removeAllListeners();
          resolve(null);
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve({ raw });
        }
      });
      req.on('error', () => resolve({}));
    });
  }

  private sendHttp(res: ServerResponse, apiRes: APIResponse): void {
    const status = apiRes.statusCode ?? (apiRes.success ? 200 : 500);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(apiRes));
  }

  /**
   * 获取认证状态
   */
  isAuthEnabled(): boolean {
    return this.middlewares.length > 0;
  }
}
