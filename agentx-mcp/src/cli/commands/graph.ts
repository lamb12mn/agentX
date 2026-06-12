import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { getAsset, listAssets, getDependents } from '../../store/assets.js';

export function registerGraphCommand(program: Command) {
    program
        .command('graph <assetId>')
        .description('生成指定资产的依赖关系图 (DOT 格式)')
        .option('-o, --output <file>', '输出到文件 (否则打印到控制台)')
        .option('-d, --depth <number>', '递归深度', '2')
        .action(async (assetId: string, options: { output?: string; depth: string }) => {
            try {
                // 获取资产基本信息
                const asset = await getAsset(assetId);
                if (!asset) {
                    console.error(chalk.red(`资产 ${assetId} 不存在`));
                    process.exit(1);
                }
                
                const depth = parseInt(options.depth);
                const visited = new Set<string>();
                const edges: string[] = [];
                
                // 递归收集依赖关系
                async function collectDeps(id: string, currentDepth: number, _parentId?: string) {
                    if (currentDepth > depth || visited.has(id)) return;
                    visited.add(id);
                    
                    const assetInfo = await getAsset(id);
                    const dependencies = (assetInfo as any)?.metadata?.dependsOn || [];
                    for (const depId of dependencies) {
                        edges.push(`    "${id}" -> "${depId}";`);
                        await collectDeps(depId, currentDepth + 1, id);
                    }
                }
                
                await collectDeps(assetId, 0);
                
                let dot = `digraph G {
    rankdir=LR;
    node [shape=box];
`;
                dot += edges.join('\n');
                dot += '\n}';
                
                if (options.output) {
                    fs.writeFileSync(options.output, dot, 'utf8');
                    console.log(chalk.green(`依赖图已保存到 ${options.output}`));
                    console.log(chalk.cyan('提示：可以使用 Graphviz 渲染: dot -Tpng graph.dot -o graph.png'));
                } else {
                    console.log(dot);
                }
            } catch (err) {
                console.error(chalk.red('生成依赖图失败:'), (err as Error).message);
                process.exit(1);
            }
        });
}