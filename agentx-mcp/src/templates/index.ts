/**
 * AgentX Template System
 * Provides preset templates for creating new assets
 */

import type { AssetType } from '../types.js';

/**
 * Template definition for creating new assets
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  type: AssetType;
  content: string;
  tags: string[];
}

/**
 * Predefined skill templates
 */
export const skillTemplates: Template[] = [
  {
    id: 'skill-basic',
    name: 'Basic Skill',
    description: 'Simple skill with name and instructions',
    type: 'skill',
    content: `# Skill Name

## Description
Brief description of what this skill does.

## Instructions
- Step 1: Do something
- Step 2: Do another thing

## Examples
Example usage:
`,
    tags: ['template', 'basic'],
  },
  {
    id: 'skill-code',
    name: 'Code Review Skill',
    description: 'Skill for code review tasks',
    type: 'skill',
    content: `# Code Review Skill

## Description
Review code for issues and improvements.

## Review Criteria
1. **Security**: Check for vulnerabilities
2. **Performance**: Identify optimizations
3. **Style**: Enforce coding standards

## Output Format
- Issues found with severity levels
- Suggested fixes
`,
    tags: ['template', 'code-review'],
  },
  {
    id: 'skill-writing',
    name: 'Writing Assistant Skill',
    description: 'Skill for content writing',
    type: 'skill',
    content: `# Writing Assistant

## Description
Help with writing and editing content.

## Capabilities
- Draft content
- Edit and refine
- Proofread

## Tone Guidelines
- Professional yet approachable
- Clear and concise
- Action-oriented
`,
    tags: ['template', 'writing'],
  },
];

/**
 * Predefined agent templates
 */
export const agentTemplates: Template[] = [
  {
    id: 'agent-developer',
    name: 'Developer Agent',
    description: 'Full-stack developer agent',
    type: 'agent',
    content: `name: Developer Agent
version: "1.0.0"
description: Full-stack developer for building applications
role_prompt: |
  You are an expert full-stack developer.
  You write clean, maintainable code.
  You follow best practices and security guidelines.
rules:
  - Use TypeScript for type safety
  - Write tests for all features
  - Document public APIs
skills:
  - code-review
  - testing
`,
    tags: ['template', 'developer'],
  },
  {
    id: 'agent-researcher',
    name: 'Research Agent',
    description: 'Research and analysis agent',
    type: 'agent',
    content: `name: Research Agent
version: "1.0.0"
description: Research and gather information
role_prompt: |
  You are a research assistant.
  Find accurate information and cite sources.
  Present findings clearly.
rules:
  - Verify information from multiple sources
  - Provide citations
  - Be objective
skills:
  - search
  - writing
`,
    tags: ['template', 'research'],
  },
];

/**
 * Predefined MCP server templates
 */
export const mcpTemplates: Template[] = [
  {
    id: 'mcp-filesystem',
    name: 'Filesystem Server',
    description: 'MCP server for file operations',
    type: 'mcp',
    content: `name: filesystem
command: npx
args:
  - -y
  - @modelcontextprotocol/server-filesystem
  - /path/to/allowed/directory
enabled: true
`,
    tags: ['template', 'filesystem'],
  },
  {
    id: 'mcp-brave',
    name: 'Brave Search Server',
    description: 'MCP server for web search',
    type: 'mcp',
    content: `name: brave-search
command: npx
args:
  - -y
  - @modelcontextprotocol/server-brave-search
env:
  BRAVE_API_KEY: \${BRAVE_API_KEY}
enabled: false
`,
    tags: ['template', 'search'],
  },
];

/**
 * Predefined prompt templates
 */
export const promptTemplates: Template[] = [
  {
    id: 'prompt-analysis',
    name: 'Analysis Prompt',
    description: 'Prompt for analyzing data',
    type: 'prompt',
    content: `Analyze the provided data and identify key insights.

For each finding:
1. State the observation
2. Explain the significance
3. Suggest implications

Provide a summary with actionable recommendations.`,
    tags: ['template', 'analysis'],
  },
  {
    id: 'prompt-code',
    name: 'Code Generation Prompt',
    description: 'Prompt for generating code',
    type: 'prompt',
    content: `Generate code based on the requirements.

Requirements:
- Specify the programming language
- Describe the functionality
- Define input/output

Constraints:
- Follow best practices
- Include error handling
- Add comments for clarity`,
    tags: ['template', 'code'],
  },
];

/**
 * Predefined rule templates
 */
export const ruleTemplates: Template[] = [
  {
    id: 'rule-typescript',
    name: 'TypeScript Rules',
    description: 'TypeScript coding standards',
    type: 'rule',
    content: `# TypeScript Coding Rules

## Type Safety
- Never use \`any\` unless absolutely necessary
- Use explicit return types for public functions
- Prefer \`const\` over \`let\`

## Naming
- Use PascalCase for types and interfaces
- Use camelCase for variables and functions
- Use UPPER_SNAKE_CASE for constants

## Best Practices
- Enable strict mode
- Enable \`noImplicitAny\`
- Use discriminated unions for state
`,
    tags: ['template', 'typescript'],
  },
];

/**
 * Predefined team templates
 */
export const teamTemplates: Template[] = [
  {
    id: 'team-research-review',
    name: 'Research & Review Team',
    description: 'Three-agent pipeline: researcher → writer → reviewer',
    type: 'team',
    content: JSON.stringify({
      name: 'research-review',
      version: '1.0.0',
      description: 'A team that researches a topic, writes a report, and reviews it for quality.',
      agents: [
        { role: 'researcher', agent_ref: 'researcher-agent', required: true },
        { role: 'writer', agent_ref: 'writer-agent', required: true },
        { role: 'reviewer', agent_ref: 'reviewer-agent', required: false },
      ],
      workflow: [
        { from: 'researcher', to: 'writer' },
        { from: 'writer', to: 'reviewer' },
      ],
      retry: { maxRetries: 1, backoffMs: 1000 },
      timeout: 60000,
    }, null, 2),
    tags: ['template', 'team', 'research'],
  },
  {
    id: 'team-code-review',
    name: 'Code Review Team',
    description: 'Two-agent pipeline: coder → reviewer',
    type: 'team',
    content: JSON.stringify({
      name: 'code-review',
      version: '1.0.0',
      description: 'A team that writes code and reviews it for quality and security.',
      agents: [
        { role: 'coder', agent_ref: 'developer-agent', required: true },
        { role: 'reviewer', agent_ref: 'reviewer-agent', required: true },
      ],
      workflow: [
        { from: 'coder', to: 'reviewer' },
      ],
      retry: { maxRetries: 1, backoffMs: 1000 },
      timeout: 30000,
    }, null, 2),
    tags: ['template', 'team', 'code'],
  },
];

/**
 * Predefined workflow templates
 */
export const workflowTemplates: Template[] = [
  {
    id: 'workflow-code-review',
    name: 'Code Review Workflow',
    description: 'Automated code review workflow',
    type: 'workflow',
    content: `name: code-review
version: "1.0.0"
steps:
  - name: lint
    action: run linter
  - name: test
    action: run tests
  - name: review
    action: analyze results
on_failure: stop
`,
    tags: ['template', 'review'],
  },
];

/**
 * Get all templates for a given asset type
 * @param type - The asset type to filter by
 * @returns Array of templates matching the specified type
 */
export function getTemplatesByType(type: AssetType): Template[] {
  switch (type) {
    case 'skill': return skillTemplates;
    case 'agent': return agentTemplates;
    case 'mcp': return mcpTemplates;
    case 'prompt': return promptTemplates;
    case 'rule': return ruleTemplates;
    case 'workflow': return workflowTemplates;
    case 'team': return teamTemplates;
    default: return [];
  }
}

/**
 * Get a template by its unique ID
 * @param id - The template ID to look up
 * @returns The matching template, or undefined if not found
 */
export function getTemplate(id: string): Template | undefined {
  const all = [...skillTemplates, ...agentTemplates, ...mcpTemplates, ...promptTemplates, ...ruleTemplates, ...workflowTemplates, ...teamTemplates];
  return all.find(t => t.id === id);
}

/**
 * List all available templates across all asset types
 * @returns Array of all predefined templates
 */
export function listTemplates(): Template[] {
  return [
    ...skillTemplates,
    ...agentTemplates,
    ...mcpTemplates,
    ...promptTemplates,
    ...ruleTemplates,
    ...workflowTemplates,
    ...teamTemplates,
  ];
}