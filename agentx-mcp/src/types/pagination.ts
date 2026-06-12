/** 分页查询选项 */
export interface PaginationOptions {
  /** 页码（从 1 开始） */
  page?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 资产类型过滤 */
  type?: string;
  /** 搜索关键词 */
  search?: string;
  /** 排序字段 */
  sortBy?: 'name' | 'type' | 'created_at' | 'updated_at';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  /** 额外过滤条件 */
  filters?: {
    /** 标签过滤 */
    tags?: string[];
    /** 状态过滤 */
    status?: string;
    /** 日期范围 */
    dateRange?: {
      /** 起始时间戳 */
      start?: number;
      /** 结束时间戳 */
      end?: number;
    };
  };
}

/** 分页查询结果 */
export interface PaginatedResult<T> {
  /** 当前页数据 */
  data: T[];
  /** 分页信息 */
  pagination: {
    /** 当前页码 */
    page: number;
    /** 每页条数 */
    pageSize: number;
    /** 总记录数 */
    total: number;
    /** 总页数 */
    totalPages: number;
    /** 是否有下一页 */
    hasNextPage: boolean;
    /** 是否有上一页 */
    hasPrevPage: boolean;
  };
}

/** 流式读取选项 */
export interface StreamOptions {
  /** 资产类型过滤 */
  type?: string;
  /** 每批读取数量 */
  batchSize?: number;
}
