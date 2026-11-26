import { describe, expect, it } from 'vitest';
import {
  applyFrontmatterWrite,
  planFrontmatterFieldWrite,
  planFrontmatterWrite,
} from '../src/index.js';
import { createMemoryFs } from './helpers/memory-fs.js';

const PATH = '/home/dev/.claude/skills/foo/SKILL.md';

describe('planFrontmatterWrite', () => {
  it('已有 category 时替换该行', () => {
    const plan = planFrontmatterWrite(PATH, '---\nname: foo\ncategory: old\n---\n\nbody', 'new');
    expect(plan.changed).toBe(true);
    expect(plan.nextContent).toContain('category: new');
    expect(plan.nextContent).not.toContain('category: old');
    expect(plan.nextContent).toContain('name: foo');
    expect(plan.nextContent).toContain('body');
  });

  it('没有 category 时追加', () => {
    const plan = planFrontmatterWrite(PATH, '---\nname: foo\n---\nbody', 'testing');
    expect(plan.nextContent).toContain('name: foo\ncategory: testing');
  });

  it('没有 frontmatter 时在文件头新建', () => {
    const plan = planFrontmatterWrite(PATH, '# 正文\n', 'testing');
    expect(plan.nextContent.startsWith('---\ncategory: testing\n---\n')).toBe(true);
    expect(plan.nextContent).toContain('# 正文');
  });

  it('已是目标值时 changed 为 false', () => {
    const content = '---\nname: foo\ncategory: testing\n---\n';
    const plan = planFrontmatterWrite(PATH, content, 'testing');
    expect(plan.changed).toBe(false);
  });

  it('含特殊字符的分类加引号', () => {
    const plan = planFrontmatterWrite(PATH, '---\nname: foo\n---\n', '团队 内部');
    expect(plan.nextContent).toContain('category: "团队 内部"');
  });

  it('保留 BOM', () => {
    const plan = planFrontmatterWrite(PATH, '﻿---\nname: foo\n---\nbody', 'x');
    expect(plan.nextContent.startsWith('﻿---')).toBe(true);
  });
});

describe('planFrontmatterFieldWrite', () => {
  it('已有 version 时替换该行且保留其他字段', () => {
    const plan = planFrontmatterFieldWrite(
      PATH,
      '---\nname: foo\ndescription: bar\nversion: 1.2.3\n---\n\nbody',
      'version',
      '1.2.4',
    );
    expect(plan.changed).toBe(true);
    expect(plan.nextContent).toContain('version: 1.2.4');
    expect(plan.nextContent).not.toContain('version: 1.2.3');
    expect(plan.nextContent).toContain('name: foo\ndescription: bar');
    expect(plan.nextContent).toContain('body');
  });

  it('没有 version 时追加到 frontmatter 末尾', () => {
    const plan = planFrontmatterFieldWrite(
      PATH,
      '---\nname: foo\ndescription: bar\n---\nbody',
      'version',
      '0.1.0',
    );
    expect(plan.nextContent).toContain('description: bar\nversion: 0.1.0');
  });

  it('没有 frontmatter 时在文件头新建 version', () => {
    const plan = planFrontmatterFieldWrite(PATH, '# 正文\n', 'version', '0.1.0');
    expect(plan.nextContent.startsWith('---\nversion: 0.1.0\n---\n')).toBe(true);
    expect(plan.nextContent).toContain('# 正文');
  });

  it('已是目标值时 changed 为 false', () => {
    const content = '---\nname: foo\nversion: 1.2.4\n---\n';
    expect(planFrontmatterFieldWrite(PATH, content, 'version', '1.2.4').changed).toBe(false);
  });

  it('非法字段名被拒绝', () => {
    expect(() => planFrontmatterFieldWrite(PATH, '---\n---\n', '../x', 'y')).toThrow(
      '不支持的 frontmatter 字段名',
    );
  });
});

describe('applyFrontmatterWrite', () => {
  it('dry-run 不写任何文件', async () => {
    const content = '---\nname: foo\n---\nbody';
    const memory = createMemoryFs({ [PATH]: content });
    const plan = planFrontmatterWrite(PATH, content, 'testing');
    const result = await applyFrontmatterWrite(memory.fs, plan, { dryRun: true });

    expect(result.written).toBe(false);
    expect(memory.writes).toEqual([]);
    expect(memory.files.get(PATH)).toBe(content);
  });

  it('实际写入生成 .bak 备份', async () => {
    const content = '---\nname: foo\n---\nbody';
    const memory = createMemoryFs({ [PATH]: content });
    const plan = planFrontmatterWrite(PATH, content, 'testing');
    const result = await applyFrontmatterWrite(memory.fs, plan);

    expect(result.written).toBe(true);
    expect(result.backupPath).toBe(`${PATH}.bak`);
    expect(memory.files.get(PATH)).toBe(plan.nextContent);
    expect(memory.files.get(`${PATH}.bak`)).toBe(content);
  });

  it('预览后文件被修改则中止写入', async () => {
    const content = '---\nname: foo\n---\nbody';
    const memory = createMemoryFs({ [PATH]: content });
    const plan = planFrontmatterWrite(PATH, content, 'testing');
    memory.files.set(PATH, '---\nname: foo\ncategory: edited\n---\nbody');

    await expect(applyFrontmatterWrite(memory.fs, plan)).rejects.toThrow('文件在预览后被修改');
  });

  it('无变化时不写盘', async () => {
    const content = '---\nname: foo\ncategory: testing\n---\n';
    const memory = createMemoryFs({ [PATH]: content });
    const plan = planFrontmatterWrite(PATH, content, 'testing');
    const result = await applyFrontmatterWrite(memory.fs, plan);
    expect(result.written).toBe(false);
    expect(memory.writes).toEqual([]);
  });
});