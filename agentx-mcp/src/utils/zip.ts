import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { getAsset, listAssets, readAssetContent } from '../store/assets.js';
import archiver from 'archiver';

/**
 * 导出所有资产为ZIP格式
 * @param baseDir 基础目录
 * @param outputPath 输出文件路径（可选，默认自动生成）
 * @param options 导出选项
 * @returns 导出结果
 */
export async function exportAllToZip(
  baseDir: string,
  outputPath?: string,
  options: { includeContent?: boolean } = {}
): Promise<string> {
  const assets = await listAssets();

  // 确定输出路径
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = outputPath ?? join(baseDir, 'exports', `agentx-export-${timestamp}.zip`);

  // 确保输出目录存在
  await mkdir(dirname(filename), { recursive: true });

  return new Promise((resolve, reject) => {
    const output = createWriteStream(filename);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩率
    });

    output.on('close', () => resolve(filename));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    // 添加元数据清单
    archive.append(
      JSON.stringify({
        version: '1.0.0',
        exported_at: new Date().toISOString(),
        total_assets: assets.length,
        assets: assets.map(a => ({
          id: a.id,
          type: a.type,
          name: a.name,
          tags: a.tags,
        })),
      }, null, 2),
      { name: 'manifest.json' }
    );

    // 添加每个资产
    let count = 0;
    for (const asset of assets) {
      const contentPromise = readAssetContent(asset.id);

      contentPromise.then(content => {
        const data = {
          id: asset.id,
          type: asset.type,
          name: asset.name,
          description: asset.description,
          tags: asset.tags,
          file_path: asset.file_path,
          created_at: asset.created_at,
          updated_at: asset.updated_at,
        };

        if (options.includeContent !== false) {
          (data as any).content = content;
        }

        // JSON元数据文件
        const jsonFileName = `${asset.type}s/${asset.name}.json`;
        archive.append(
          JSON.stringify(data, null, 2),
          { name: jsonFileName }
        );

        // 原始内容文件
        if (options.includeContent !== false) {
          const ext = asset.type === 'mcp' || asset.type === 'workflow' || asset.type === 'agent' ? '.yaml' : '.md';
          const contentFileName = `${asset.type}s/${asset.name}${ext}`;
          archive.append(content, { name: contentFileName });
        }

        count++;

        // 所有资产处理完成后完成
        if (count === assets.length) {
          archive.finalize();
        }
      }).catch(err => {
        console.error(`Failed to read asset ${asset.id}:`, err);
        count++;
        if (count === assets.length) {
          archive.finalize();
        }
      });
    }

    // 处理空资产库的情况
    if (assets.length === 0) {
      archive.finalize();
    }
  });
}

/**
 * 导出所有资产为JSON格式（单个文件）
 */
export async function exportAllToJson(
  baseDir: string,
  outputPath?: string
): Promise<string> {
  const assets = await listAssets();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = outputPath ?? join(baseDir, 'exports', `agentx-export-${timestamp}.json`);

  await mkdir(dirname(filename), { recursive: true });

  const data = await Promise.all(
    assets.map(async (asset) => ({
      meta: asset,
      content: await readAssetContent(asset.id),
    }))
  );

  const { writeFile } = await import('fs/promises');
  await writeFile(filename, JSON.stringify(data, null, 2), 'utf-8');

  return filename;
}

/**
 * 导出所有资产为YAML格式（单个文件）
 */
export async function exportAllToYaml(
  baseDir: string,
  outputPath?: string
): Promise<string> {
  const assets = await listAssets();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const filename = outputPath ?? join(baseDir, 'exports', `agentx-export-${timestamp}.yaml`);

  await mkdir(dirname(filename), { recursive: true });

  const data = await Promise.all(
    assets.map(async (asset) => ({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      tags: asset.tags,
      content: await readAssetContent(asset.id),
    }))
  );

  const yaml = await import('js-yaml');
  const { writeFile } = await import('fs/promises');
  await writeFile(filename, yaml.dump(data, { indent: 2, lineWidth: -1 }), 'utf-8');

  return filename;
}

// 导出别名（供其他模块使用）
export const exportAsZip = exportAllToZip;
export const exportAsJson = exportAllToJson;
export const exportAsYaml = exportAllToYaml;
