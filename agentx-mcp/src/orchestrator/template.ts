/**
 * Lightweight template renderer for workflow step input templates.
 *
 * Supports:
 *   - Simple variable substitution:  {{variable}}
 *   - Nested path access:            {{input.topic}}, {{output.summary}}
 *   - Fallback to original placeholder if variable not found
 *
 * Not a full Mustache/Handlebars engine — intentionally minimal.
 * Use for input_template rendering in TeamEngine.
 */

/**
 * Get a value from a nested object using a dot-delimited path.
 * Returns `undefined` if any segment of the path does not exist.
 */
export function getPathValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Render a template string by replacing {{path}} placeholders
 * with values from the provided context object.
 *
 * @param template  The template string containing {{path}} markers
 * @param context   Object to resolve paths against
 * @returns         Rendered string with placeholders replaced
 *
 * @example
 * renderTemplate('Topic: {{input.topic}}', { input: { topic: 'AI' } })
 * // => 'Topic: AI'
 *
 * renderTemplate('From input: {{unknown_var}}', { input: {} })
 * // => 'From input: {{unknown_var}'  (unchanged if not found)
 */
export function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmed = path.trim();
    if (!trimmed) return match;

    const value = getPathValue(context, trimmed);
    if (value === undefined || value === null) {
      // Keep the original placeholder so the user can see what was missing
      return match;
    }

    return String(value);
  });
}
