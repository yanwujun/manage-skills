import { loadIndex, saveTags, tagCounts } from '@manage-skills/core';
import { createNodeFs } from '../io/node-fs.js';
import { createPlatformEnv } from '../io/env.js';
import { indexPath } from '../io/paths.js';

export interface TagOptions {
  action?: string;
  target?: string;
  tags?: string[];
}

export async function runTag(options: TagOptions): Promise<number> {
  const env = createPlatformEnv();
  const fs = createNodeFs();
  const idxPath = indexPath(env.homedir);
  const loaded = await loadIndex(fs, idxPath);
  if (!loaded.index) {
    console.error('索引不存在，请先运行 manage-skills scan');
    return 1;
  }

  if (!options.action) {
    const counts = tagCounts(loaded.index.skills);
    if (counts.length === 0) {
      console.log('暂无标签');
      return 0;
    }
    for (const item of counts) {
      console.log(`${String(item.count).padStart(4)}  ${item.tag}`);
    }
    return 0;
  }

  if (options.action !== 'add' && options.action !== 'remove') {
    console.error('用法：manage-skills tag [add|remove] <技能名|路径> <标签...>');
    return 1;
  }
  if (!options.target || !options.tags || options.tags.length === 0) {
    console.error('用法：manage-skills tag [add|remove] <技能名|路径> <标签...>');
    return 1;
  }

  const target = loaded.index.skills.find(
    (record) => record.path === options.target || record.frontmatter.name === options.target,
  );
  if (!target) {
    console.error(`未在索引中找到技能：${options.target}`);
    return 1;
  }

  await saveTags(
    fs,
    idxPath,
    loaded.index,
    [target.path],
    options.action === 'add' ? { add: options.tags } : { remove: options.tags },
  );
  console.log(
    `${options.action === 'add' ? '已添加' : '已移除'}标签：` +
      `${target.frontmatter.name ?? target.path} -> ${options.tags.join(', ')}`,
  );
  return 0;
}