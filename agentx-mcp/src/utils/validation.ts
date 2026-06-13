/**
 * AgentX Validation Module
 * Provides input validation with enhanced user feedback
 */

import type { AssetType } from '../types.js';
import { validateAssetName, validateAssetType } from './errors.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Represents a validation error for a specific input field,
 * including an error code, human-readable message, and actionable suggestion.
 */
export interface ValidationError {
  field: string;
  code: string;
  message: string;
  suggestion: string;
}

/**
 * Represents a non-blocking validation warning for a specific input field.
 * Warnings do not prevent the operation but suggest potential issues.
 */
export interface ValidationWarning {
  field: string;
  message: string;
}

/**
 * Validates create asset input
 */
export function validateCreateAssetInput(input: {
  type?: string;
  name?: string;
  content?: string;
  description?: string;
  tags?: unknown;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate type
  if (!input.type) {
    errors.push({
      field: 'type',
      code: 'MISSING_REQUIRED_FIELD',
      message: 'Asset type is required',
      suggestion: 'Specify type: skill, agent, prompt, rule, mcp, or workflow',
    });
  } else if (!validateAssetType(input.type)) {
    errors.push({
      field: 'type',
      code: 'INVALID_FIELD_TYPE',
      message: `Invalid type: ${input.type}`,
      suggestion: 'Valid types: skill, agent, prompt, rule, mcp, workflow',
    });
  }

  // Validate name
  if (!input.name) {
    errors.push({
      field: 'name',
      code: 'MISSING_REQUIRED_FIELD',
      message: 'Asset name is required',
      suggestion: 'Provide a name for the asset',
    });
  } else {
    const nameValidation = validateAssetName(input.name);
    if (!nameValidation.valid) {
      errors.push({
        field: 'name',
        code: 'INVALID_FIELD_TYPE',
        message: nameValidation.error || 'Invalid name format',
        suggestion: 'Use only letters, numbers, underscores, hyphens, and spaces',
      });
    }
  }

  // Validate content (required for most types)
  if (!input.content && input.type !== 'agent' && input.type !== 'mcp' && input.type !== 'team') {
    errors.push({
      field: 'content',
      code: 'MISSING_REQUIRED_FIELD',
      message: 'Asset content is required',
      suggestion: 'Provide the content for the asset',
    });
  }

  // Validate description length
  if (input.description && input.description.length > 500) {
    warnings.push({
      field: 'description',
      message: 'Description is longer than 500 characters',
    });
  }

  // Validate tags
  if (input.tags && !Array.isArray(input.tags)) {
    errors.push({
      field: 'tags',
      code: 'INVALID_FIELD_TYPE',
      message: 'Tags must be an array',
      suggestion: 'Provide tags as an array of strings: ["tag1", "tag2"]',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates update asset input
 */
export function validateUpdateAssetInput(input: {
  id?: string;
  name?: string;
  description?: string;
  tags?: unknown;
  content?: string;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate id
  if (!input.id) {
    errors.push({
      field: 'id',
      code: 'MISSING_REQUIRED_FIELD',
      message: 'Asset ID is required for update',
      suggestion: 'Provide the ID of the asset to update',
    });
  }

  // Validate name if provided
  if (input.name) {
    const nameValidation = validateAssetName(input.name);
    if (!nameValidation.valid) {
      errors.push({
        field: 'name',
        code: 'INVALID_FIELD_TYPE',
        message: nameValidation.error || 'Invalid name format',
        suggestion: 'Use only letters, numbers, underscores, hyphens, and spaces',
      });
    }
  }

  // Validate description length
  if (input.description && input.description.length > 500) {
    warnings.push({
      field: 'description',
      message: 'Description is longer than 500 characters',
    });
  }

  // Validate tags
  if (input.tags && !Array.isArray(input.tags)) {
    errors.push({
      field: 'tags',
      code: 'INVALID_FIELD_TYPE',
      message: 'Tags must be an array',
      suggestion: 'Provide tags as an array of strings: ["tag1", "tag2"]',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates delete asset input
 */
export function validateDeleteAssetInput(input: { id?: string }): ValidationResult {
  const errors: ValidationError[] = [];

  if (!input.id) {
    errors.push({
      field: 'id',
      code: 'MISSING_REQUIRED_FIELD',
      message: 'Asset ID is required for deletion',
      suggestion: 'Provide the ID of the asset to delete',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Validates search query
 */
export function validateSearchQuery(input: { query?: string }): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input.query) {
    warnings.push({
      field: 'query',
      message: 'No search query provided, returning all assets',
    });
  } else if (input.query.length < 2) {
    errors.push({
      field: 'query',
      code: 'FIELD_TOO_SHORT',
      message: 'Search query must be at least 2 characters',
      suggestion: 'Provide a longer search term for better results',
    });
  } else if (input.query.length > 100) {
    warnings.push({
      field: 'query',
      message: 'Long search query may return fewer results',
    });
  }

  // Check for potentially problematic characters
  if (/[<>{}\\]/.test(input.query || '')) {
    errors.push({
      field: 'query',
      code: 'INVALID_QUERY',
      message: 'Search query contains special characters',
      suggestion: 'Use plain text keywords, avoid < > { } \\',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Formats validation result as user-friendly message
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.valid && result.warnings.length === 0) {
    return '✅ Input validation passed';
  }

  const lines: string[] = [];

  if (!result.valid) {
    lines.push('❌ Validation failed:');
    result.errors.forEach(err => {
      lines.push(`  • ${err.field}: ${err.message}`);
      lines.push(`    💡 ${err.suggestion}`);
    });
  }

  if (result.warnings.length > 0) {
    if (!result.valid) lines.push('');
    lines.push('⚠️ Warnings:');
    result.warnings.forEach(warn => {
      lines.push(`  • ${warn.field}: ${warn.message}`);
    });
  }

  return lines.join('\n');
}

/**
 * Validates asset id format
 */
export function validateAssetId(id: string): { valid: boolean; error?: string } {
  if (!id) {
    return { valid: false, error: 'Asset ID is required' };
  }

  // UUID format check (basic)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id) && !/^[a-zA-Z0-9_\-]+$/.test(id)) {
    return { valid: false, error: 'Invalid asset ID format' };
  }

  return { valid: true };
}

/**
 * Validates list query parameters
 */
export function validateListQuery(input: {
  type?: string;
  limit?: unknown;
  offset?: unknown;
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate type
  if (input.type && !validateAssetType(input.type)) {
    errors.push({
      field: 'type',
      code: 'INVALID_FIELD_TYPE',
      message: `Invalid type: ${input.type}`,
      suggestion: 'Valid types: skill, agent, prompt, rule, mcp, workflow',
    });
  }

  // Validate limit
  if (input.limit !== undefined) {
    const limit = typeof input.limit === 'number' ? input.limit : parseInt(String(input.limit), 10);
    if (isNaN(limit) || limit < 1) {
      errors.push({
        field: 'limit',
        code: 'INVALID_FIELD_TYPE',
        message: 'Limit must be a positive number',
        suggestion: 'Provide a number between 1 and 100',
      });
    } else if (limit > 100) {
      warnings.push({
        field: 'limit',
        message: 'Limit exceeds 100, results may be truncated',
      });
    }
  }

  // Validate offset
  if (input.offset !== undefined) {
    const offset = typeof input.offset === 'number' ? input.offset : parseInt(String(input.offset), 10);
    if (isNaN(offset) || offset < 0) {
      errors.push({
        field: 'offset',
        code: 'INVALID_FIELD_TYPE',
        message: 'Offset must be a non-negative number',
        suggestion: 'Provide a non-negative number',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}