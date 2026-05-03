export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  type?: string;
  search?: string;
  sortBy?: 'name' | 'type' | 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
  filters?: {
    tags?: string[];
    status?: string;
    dateRange?: {
      start?: number;
      end?: number;
    };
  };
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface StreamOptions {
  type?: string;
  batchSize?: number;
}
