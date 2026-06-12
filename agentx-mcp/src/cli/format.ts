import chalk from 'chalk';
import Table from 'cli-table3';
import yaml from 'js-yaml';
import type { AssetMeta, SearchResult } from '../types.js';

/**
 * Supported output formatting types for CLI display.
 * - `table`: Rich table layout with chalk colors
 * - `json`: Pretty-printed JSON
 * - `yaml`: YAML document
 * - `simple`: Tab-separated plain text
 */
export type OutputFormat = 'table' | 'json' | 'yaml' | 'simple';

/**
 * Format assets based on output format option
 */
export function formatAssets(assets: AssetMeta[], format: OutputFormat = 'table'): string {
  switch (format) {
    case 'json':
      return JSON.stringify(assets, null, 2);
    case 'yaml':
      return yaml.dump(assets);
    case 'simple':
      return assets.map(a => `${a.id}\t${a.name}\t${a.type}`).join('\n');
    case 'table':
    default:
      return formatTable(assets);
  }
}

/**
 * Format search results based on output option
 */
export function formatSearch(results: SearchResult[], format: OutputFormat = 'table'): string {
  switch (format) {
    case 'json':
      return JSON.stringify(results, null, 2);
    case 'yaml':
      return yaml.dump(results);
    case 'simple':
      return results.map(r => `${r.score.toFixed(2)}\t${r.meta.name}\t${r.meta.type}`).join('\n');
    case 'table':
    default:
      return formatSearchResults(results);
  }
}

/**
 * Format an array of asset metadata as a styled CLI table.
 * @param assets - Array of asset metadata objects
 * @returns Formatted table string with ID, name, tags, and relative update time
 */
export function formatTable(assets: AssetMeta[]): string {
  if (assets.length === 0) return chalk.yellow('No assets found.');

  const table = new Table({
    head: ['ID', 'Name', 'Tags', 'Updated'].map((h) => chalk.cyan(h)),
    colWidths: [10, 22, 20, 10],
    style: { compact: false },
  });

  for (const a of assets) {
    const ago = timeAgo(a.updated_at);
    const tags = a.tags.join(', ') || '-';
    table.push([a.id.slice(0, 8), a.name, tags, ago]);
  }

  return table.toString();
}

/**
 * Format search results as a human-readable list with scores.
 * @param results - Array of search result objects containing score and metadata
 * @returns Formatted string with ranked results including name, type, and description
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return chalk.yellow('No results found.');

  const lines = results.map((r) => {
    const score = chalk.green(`[${r.score.toFixed(2)}]`);
    const name = chalk.bold(r.meta.name);
    const type = chalk.dim(`(${r.meta.type})`);
    const desc = r.meta.description ? ` — ${r.meta.description}` : '';
    return `  ${score} ${name} ${type}${desc}`;
  });

  return `Found ${results.length} result${results.length === 1 ? '' : 's'}:\n` + lines.join('\n');
}

/**
 * Format a single asset's metadata in the specified output format.
 * @param asset - The asset metadata object to format
 * @param format - Output format (table, json, yaml, or simple)
 * @returns Formatted string representation of the asset metadata
 */
export function formatMeta(asset: AssetMeta, format: OutputFormat = 'table'): string {
  switch (format) {
    case 'json':
      return JSON.stringify(asset, null, 2);
    case 'yaml':
      return yaml.dump(asset);
    case 'simple':
      return `${asset.id}\t${asset.name}\t${asset.type}`;
    case 'table':
    default:
      return formatMetaDetailed(asset);
  }
}

function formatMetaDetailed(asset: AssetMeta): string {
  const lines = [
    `${chalk.cyan('ID:'.padEnd(13))} ${asset.id}`,
    `${chalk.cyan('Name:'.padEnd(13))} ${asset.name}`,
    `${chalk.cyan('Type:'.padEnd(13))} ${asset.type}`,
    `${chalk.cyan('Tags:'.padEnd(13))} ${asset.tags.join(', ') || '-'}`,
    `${chalk.cyan('Description:'.padEnd(13))} ${asset.description ?? '-'}`,
    `${chalk.cyan('File:'.padEnd(13))} ${asset.file_path}`,
    `${chalk.cyan('Created:'.padEnd(13))} ${new Date(asset.created_at).toLocaleString()}`,
    `${chalk.cyan('Updated:'.padEnd(13))} ${new Date(asset.updated_at).toLocaleString()}`,
  ];
  return lines.join('\n');
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
