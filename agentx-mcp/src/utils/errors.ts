/**
 * AgentX Error Handling Module
 * Provides intelligent error messages with actionable recovery suggestions
 */

import type { AssetType } from '../types.js';

/**
 * Error codes for different error scenarios
 */
export const ErrorCode = {
  // Asset errors (1xxx)
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  ASSET_ALREADY_EXISTS: 'ASSET_ALREADY_EXISTS',
  ASSET_INVALID_NAME: 'ASSET_INVALID_NAME',
  ASSET_INVALID_TYPE: 'ASSET_INVALID_TYPE',
  ASSET_CREATE_FAILED: 'ASSET_CREATE_FAILED',
  ASSET_UPDATE_FAILED: 'ASSET_UPDATE_FAILED',
  ASSET_DELETE_FAILED: 'ASSET_DELETE_FAILED',

  // Database errors (2xxx)
  DB_NOT_INITIALIZED: 'DB_NOT_INITIALIZED',
  DB_CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  DB_QUERY_FAILED: 'DB_QUERY_FAILED',

  // File errors (3xxx)
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_FAILED: 'FILE_READ_FAILED',
  FILE_WRITE_FAILED: 'FILE_WRITE_FAILED',
  FILE_PERMISSION_DENIED: 'FILE_PERMISSION_DENIED',
  FILE_INVALID_PATH: 'FILE_INVALID_PATH',

  // Input validation errors (4xxx)
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_TYPE: 'INVALID_FIELD_TYPE',
  FIELD_TOO_LONG: 'FIELD_TOO_LONG',
  FIELD_TOO_SHORT: 'FIELD_TOO_SHORT',

  // Import/Export errors (5xxx)
  IMPORT_FAILED: 'IMPORT_FAILED',
  EXPORT_FAILED: 'EXPORT_FAILED',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Search errors (6xxx)
  SEARCH_FAILED: 'SEARCH_FAILED',
  INVALID_QUERY: 'INVALID_QUERY',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Error context with details for recovery
 */
export interface ErrorContext {
  code: ErrorCodeType;
  tool?: string;
  assetId?: string;
  assetName?: string;
  assetType?: AssetType;
  field?: string;
  suggestion?: string;
  details?: string;
}

/**
 * Maps error codes to user-friendly messages and suggestions
 */
const errorMessages: Record<ErrorCodeType, { message: string; suggestion: string }> = {
  // Asset errors
  [ErrorCode.ASSET_NOT_FOUND]: {
    message: 'The requested asset was not found',
    suggestion: 'Use list_skills, list_agents, or search to find available assets',
  },
  [ErrorCode.ASSET_ALREADY_EXISTS]: {
    message: 'An asset with this name already exists',
    suggestion: 'Choose a different name or use the update command',
  },
  [ErrorCode.ASSET_INVALID_NAME]: {
    message: 'Asset name contains invalid characters',
    suggestion: 'Use only letters, numbers, underscores, and hyphens',
  },
  [ErrorCode.ASSET_INVALID_TYPE]: {
    message: 'Invalid asset type specified',
    suggestion: 'Valid types: skill, agent, prompt, rule, mcp, workflow',
  },
  [ErrorCode.ASSET_CREATE_FAILED]: {
    message: 'Failed to create the asset',
    suggestion: 'Check if the directory is writable and disk space is available',
  },
  [ErrorCode.ASSET_UPDATE_FAILED]: {
    message: 'Failed to update the asset',
    suggestion: 'Make sure the asset exists and you have write permissions',
  },
  [ErrorCode.ASSET_DELETE_FAILED]: {
    message: 'Failed to delete the asset',
    suggestion: 'Check if the file exists and you have delete permissions',
  },

  // Database errors
  [ErrorCode.DB_NOT_INITIALIZED]: {
    message: 'Database is not initialized',
    suggestion: 'Run agentx init or set AGENTX_DIR environment variable',
  },
  [ErrorCode.DB_CONNECTION_FAILED]: {
    message: 'Failed to connect to database',
    suggestion: 'Check if the database file is accessible and not corrupted',
  },
  [ErrorCode.DB_QUERY_FAILED]: {
    message: 'Database query failed',
    suggestion: 'Try again or check database integrity',
  },

  // File errors
  [ErrorCode.FILE_NOT_FOUND]: {
    message: 'The specified file was not found',
    suggestion: 'Verify the file path and permissions',
  },
  [ErrorCode.FILE_READ_FAILED]: {
    message: 'Failed to read the file',
    suggestion: 'Check if the file is readable and not corrupted',
  },
  [ErrorCode.FILE_WRITE_FAILED]: {
    message: 'Failed to write to the file',
    suggestion: 'Check directory permissions and disk space',
  },
  [ErrorCode.FILE_PERMISSION_DENIED]: {
    message: 'Permission denied to access the file',
    suggestion: 'Check file and directory permissions',
  },
  [ErrorCode.FILE_INVALID_PATH]: {
    message: 'The file path is invalid',
    suggestion: 'Use absolute paths or paths relative to the project directory',
  },

  // Input validation errors
  [ErrorCode.INVALID_INPUT]: {
    message: 'Invalid input provided',
    suggestion: 'Check the input format matches the expected schema',
  },
  [ErrorCode.MISSING_REQUIRED_FIELD]: {
    message: 'Required field is missing',
    suggestion: 'Provide all required fields: name and content',
  },
  [ErrorCode.INVALID_FIELD_TYPE]: {
    message: 'Field has incorrect type',
    suggestion: 'Check the field type matches the expected schema',
  },
  [ErrorCode.FIELD_TOO_LONG]: {
    message: 'Field value exceeds maximum length',
    suggestion: 'Shorten the value to fit within the limit',
  },
  [ErrorCode.FIELD_TOO_SHORT]: {
    message: 'Field value is too short',
    suggestion: 'Provide a longer value to meet minimum requirements',
  },

  // Import/Export errors
  [ErrorCode.IMPORT_FAILED]: {
    message: 'Failed to import assets',
    suggestion: 'Check the import file format and content',
  },
  [ErrorCode.EXPORT_FAILED]: {
    message: 'Failed to export assets',
    suggestion: 'Check destination directory permissions',
  },
  [ErrorCode.INVALID_FORMAT]: {
    message: 'Invalid file format',
    suggestion: 'Use JSON, YAML, or Markdown format',
  },

  // Search errors
  [ErrorCode.SEARCH_FAILED]: {
    message: 'Search operation failed',
    suggestion: 'Try simpler search terms or check database status',
  },
  [ErrorCode.INVALID_QUERY]: {
    message: 'Search query is invalid',
    suggestion: 'Use plain text keywords, avoid special characters',
  },
};

/**
 * Formats an error with context into a user-friendly message
 */
export function formatError(error: Error | string, context?: ErrorContext): string {
  let code: ErrorCodeType;
  let message = '';
  let details: string[] = [];

  // Extract error code from error message or use default
  if (typeof error === 'string') {
    code = ErrorCode.INVALID_INPUT;
    message = error;
  } else {
    const errorMsg = error.message;

    // Try to extract error code from message
    const codeMatch = errorMsg.match(/\[(\w+)\]/);
    if (codeMatch) {
      code = codeMatch[1] as ErrorCodeType;
      message = errorMessages[code]?.message || errorMsg;
    } else {
      // Map common error patterns to codes
      if (errorMsg.includes('not found')) {
        code = ErrorCode.ASSET_NOT_FOUND;
      } else if (errorMsg.includes('already exists')) {
        code = ErrorCode.ASSET_ALREADY_EXISTS;
      } else if (errorMsg.includes('permission denied')) {
        code = ErrorCode.FILE_PERMISSION_DENIED;
      } else {
        code = ErrorCode.INVALID_INPUT;
        message = errorMsg;
      }
    }
  }

  // Build error details
  const info = errorMessages[code];

  if (context?.tool) details.push(`Tool: ${context.tool}`);
  if (context?.assetId) details.push(`Asset ID: ${context.assetId}`);
  if (context?.assetName) details.push(`Asset: ${context.assetName}`);
  if (context?.assetType) details.push(`Type: ${context.assetType}`);
  if (context?.field) details.push(`Field: ${context.field}`);

  // Build response
  const lines: string[] = [
    `❌ ${info?.message || message}`,
  ];

  if (details.length > 0) {
    lines.push('', 'Details:');
    details.forEach(d => lines.push(`  • ${d}`));
  }

  lines.push('', '💡 Suggestion:', `  ${context?.suggestion || info?.suggestion || 'Try again with correct parameters'}`);

  return lines.join('\n');
}

/**
 * Creates an error with code for structured handling
 */
export function createError(code: ErrorCodeType, details?: Partial<ErrorContext>): Error {
  const info = errorMessages[code];
  let message = `[${code}] ${info?.message}`;

  if (details?.assetId) message += ` (id: ${details.assetId})`;
  if (details?.assetName) message += ` (name: ${details.assetName})`;
  if (details?.details) message += ` - ${details.details}`;

  const error = new Error(message);
  (error as unknown as Record<string, unknown>).code = code;
  (error as unknown as Record<string, unknown>).context = details;

  return error;
}

/**
 * Checks if error is a specific error code
 */
export function isErrorCode(error: Error, code: ErrorCodeType): boolean {
  return (error as unknown as Record<string, unknown>).code === code;
}

/**
 * Validates asset name format
 */
export function validateAssetName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Name cannot be empty' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'Name exceeds 100 characters' };
  }

  if (!/^[a-zA-Z0-9_\-.\s]+$/.test(name)) {
    return { valid: false, error: 'Name contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validates asset type
 */
export function validateAssetType(type: unknown): type is AssetType {
  const validTypes: AssetType[] = ['skill', 'agent', 'prompt', 'rule', 'mcp', 'workflow'];
  return validTypes.includes(type as AssetType);
}