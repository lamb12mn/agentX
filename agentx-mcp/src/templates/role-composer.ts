import type { Template } from './index.js';

/**
 * Parameterised built-in templates for composing / expanding role prompts.
 *
 * Placeholders use the same {{path}} syntax as src/orchestrator/template.ts,
 * so callers can pass templateVars through create_prompt / update_prompt.
 * Missing variables are left visible as placeholders on purpose.
 */
export const roleComposerTemplates: Template[] = [
  {
    id: 'func-role-capability-expander',
    name: '角色能力扩展模板',
    description: '按标准角色结构重组提示词，保留原有定位并补入新增能力域',
    type: 'prompt',
    tags: ['template', '角色提示词', '能力扩展', 'zh'],
    content: `---
name: {{role}}
composedWith: func-role-capability-expander
structure: Role / Profile / Skills / Rules / Workflows / OutputFormat / Initialization
---

# Role: {{role}}

## Profile
- language: 中文
- description: {{profileDescription}}
- expertise: {{expertise}}
- target_audience: {{audience}}

## Skills

{{skills}}

## Rules

{{rules}}

## Workflows

{{workflows}}

## OutputFormat

{{outputFormat}}

## Initialization
作为 {{role}}，你必须遵守上述 Rules，按 Workflows 执行，并按 OutputFormat 输出结果。{{initialization}}
`,
  },
];
