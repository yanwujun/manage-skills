import {
  applyFrontmatterWrite,
  listCategories,
  loadIndex,
  planFrontmatterWrite,
  saveCategory,
} from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { indexPath } from '../io/paths.js';

export interface ClassifyOptions {
  target?: string;
  category?: string;
  writeFrontmatter?: boolean;
  dryRun?: boolean;
}

export async function runClassify(options: ClassifyOptions): Promise<number> {
  const env = createPlatformEnv();
  const fs = createNodeFs();
  const idxPath = indexPath(env.homedir);
  const loaded = await loadIndex(fs, idxPath);
  if (!loaded.index) {
    console.error('索引不存在，请先运行 manage-skills scan');
    return 1;
  }

  if (!options.target) {
    const counts = listCategories(loaded.index);
    if (counts.length === 0) {
      console.log('索引中没有可分组的分类');
      return 0;
    }
    for (const item of counts) {
      console.log(`${String(item.count).padStart(4)}  ${item.value}`);
    }
    return 0;
  }

  if (!options.category) {
    console.error('用法：manage-skills classify set <路径|技能名> --category <分类>');
    return 1;
  }

  const record = loaded.index.skills.find(
    (item) => item.path === options.target || item.frontmatter.name === options.target,
  );
  if (!record) {
    console.error(`未在索引中找到技能：${options.target}`);
    return 1;
  }

  await saveCategory(fs, idxPath, loaded.index, record.path, options.category);
  console.log(`已设置分类：${record.frontmatter.name ?? record.path} -> ${options.category}`);

  if (options.writeFrontmatter) {
    const content = await fs.readTextFile(record.path);
    const plan = planFrontmatterWrite(record.path, content, options.category);
    const result = await applyFrontmatterWrite(fs, plan, { dryRun: options.dryRun });
    if (options.dryRun) {
      console.log(`[dry-run] 将写入 ${plan.path}：`);
      console.log(plan.nextContent);
    } else if (result.written) {
      console.log(`已写回 frontmatter，备份：${result.backupPath}`);
    } else {
      console.log('frontmatter 无需变更');
    }
  }

  return 0;
}