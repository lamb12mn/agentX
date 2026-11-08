/**
 * Progressive disclosure for AgentX MCP tools.
 *
 * `tools/list` only exposes a small high-frequency core set plus the
 * `discover_tools` catalog entry. Hidden tools are NOT disabled: they stay
 * callable by name, so existing automations keep working without any change.
 * `AGENTX_TOOLS=full` exposes everything; a comma-separated list (optionally
 * starting with `core`) selects or extends the exposed set.
 *
 * Purely local — no model calls and no new dependencies.
 */

export interface CatalogTool {
  description: string;
  inputSchema?: Record<string, unknown>;
}

export const DISCOVER_TOOL = 'discover_tools';
export const MATCH_TOOL = 'match_tools';

/** Meta tools are always exposed, regardless of AGENTX_TOOLS. */
export const META_TOOLS: readonly string[] = [DISCOVER_TOOL, MATCH_TOOL];

/** High-frequency tools covering the common asset / version / evaluation flows. */
export const CORE_TOOLS: readonly string[] = [
  'list_skills', 'list_prompts', 'list_rules', 'list_mcps', 'list_workflows', 'list_agents',
  'get_skill', 'get_prompt', 'get_agent',
  'create_skill', 'create_prompt',
  'search_assets',
  'create_version_snapshot', 'list_versions', 'rollback_to_version',
  'get_dependencies',
  'create_evaluation_set', 'add_evaluation_samples', 'evaluation_summary', 'compare_evaluation_sets',
  'team.run', 'team.status',
];

export interface ExposureResult {
  profile: 'core' | 'full' | 'custom';
  /** Names to expose in `tools/list` (excluding `discover_tools`). */
  exposed: string[];
  warnings: string[];
}

/** Resolve `AGENTX_TOOLS` into a de-duplicated, validated exposure list. */
export function resolveExposure(
  available: readonly string[],
  spec?: string,
  core: readonly string[] = CORE_TOOLS,
): ExposureResult {
  const raw = (spec ?? '').trim();
  if (!raw || raw === 'core') return select('core', core, available);
  if (raw === 'full') return select('full', available, available);
  const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
  const withCore = parts.includes('core');
  const requested = parts.filter(part => part !== 'core');
  return select('custom', withCore ? [...core, ...requested] : requested, available);
}

function select(
  profile: ExposureResult['profile'],
  requested: readonly string[],
  available: readonly string[],
): ExposureResult {
  const known = new Set(available);
  const seen = new Set<string>();
  const warnings: string[] = [];
  for (const name of requested) {
    if (META_TOOLS.includes(name)) continue;
    if (!known.has(name)) {
      warnings.push(`Unknown tool in AGENTX_TOOLS: ${name}`);
      continue;
    }
    seen.add(name);
  }
  return { profile, exposed: [...seen], warnings };
}

export interface DiscoverParams {
  query?: string;
  group?: string;
  includeSchema?: boolean;
  limit?: number;
}

export interface DiscoverEntry {
  name: string;
  group: string;
  description: string;
  exposed: boolean;
  inputSchema?: Record<string, unknown>;
}

export interface DiscoverResult {
  profile: string;
  exposedCount: number;
  totalTools: number;
  groups: Array<{ name: string; total: number; exposed: number }>;
  tools: DiscoverEntry[];
  hint: string;
}

const HINT = 'Hidden tools stay callable by name. Set AGENTX_TOOLS=full (or a comma-separated list, optionally starting with core) and restart to show them in tools/list.';

/** Search the full tool catalog; exposed tools are flagged, hidden ones stay visible here. */
export function searchCatalog(
  tools: Record<string, CatalogTool>,
  groups: Record<string, string>,
  exposed: ReadonlySet<string>,
  profile: string,
  params: DiscoverParams = {},
): DiscoverResult {
  const query = (params.query ?? '').trim().toLowerCase();
  const groupFilter = (params.group ?? '').trim();
  const limit = params.limit ?? 30;
  const safeLimit = Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : 30;

  const entries = Object.entries(tools).map(([name, tool]) => ({
    name,
    group: groups[name] ?? (name.includes('.') ? name.split('.')[0] : 'other'),
    description: tool.description,
    exposed: exposed.has(name),
    inputSchema: tool.inputSchema,
  }));

  const byGroup = new Map<string, { name: string; total: number; exposed: number }>();
  for (const entry of entries) {
    const stat = byGroup.get(entry.group) ?? { name: entry.group, total: 0, exposed: 0 };
    stat.total += 1;
    if (entry.exposed) stat.exposed += 1;
    byGroup.set(entry.group, stat);
  }

  const matched: DiscoverEntry[] = entries
    .filter(entry => {
      if (groupFilter && entry.group !== groupFilter) return false;
      if (!query) return true;
      return `${entry.name} ${entry.description}`.toLowerCase().includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, safeLimit)
    .map(({ inputSchema, ...rest }) => ({
      ...rest,
      ...(params.includeSchema ? { inputSchema: inputSchema ?? { type: 'object' } } : {}),
    }));

  return {
    profile,
    exposedCount: entries.filter(entry => entry.exposed).length,
    totalTools: entries.length,
    groups: [...byGroup.values()].sort((a, b) => a.name.localeCompare(b.name)),
    tools: matched,
    hint: HINT,
  };
}

export interface CatalogContext {
  tools: Record<string, CatalogTool>;
  groups: Record<string, string>;
  exposed: ReadonlySet<string>;
  profile: string;
}

/** Register the single discovery tool that is always exposed. */
export function registerCatalogTools(context: CatalogContext) {
  return {
    discover_tools: {
      description: 'Browse AgentX tools by keyword or group. For a natural-language intent, use match_tools instead; hidden tools are still callable by name.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keyword matched against tool name and description' },
          group: { type: 'string', description: 'Only return tools in this group (e.g. evaluations, teams, vault)' },
          includeSchema: { type: 'boolean', description: 'Include each tool inputSchema (default false)' },
          limit: { type: 'number', description: 'Maximum results, 1-100 (default 30)' },
        },
      },
      handler: async (params: DiscoverParams = {}): Promise<DiscoverResult> =>
        searchCatalog(context.tools, context.groups, context.exposed, context.profile, params),
    },
  };
}
