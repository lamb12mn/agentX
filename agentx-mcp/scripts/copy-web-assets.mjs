import { copyFileSync, mkdirSync } from 'fs';

copyFileSync('src/web/index.html', 'dist/web/index.html');
mkdirSync('dist/builtin-prompts', { recursive: true });
copyFileSync(
  'src/builtin-prompts/garden-prompts.json',
  'dist/builtin-prompts/garden-prompts.json',
);
