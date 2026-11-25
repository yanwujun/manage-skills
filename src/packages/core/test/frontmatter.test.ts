import { describe, expect, it } from 'vitest';
import { parseSkillFile } from '../src/index.js';

describe('parseSkillFile', () => {
  it('解析正常 frontmatter 与正文', () => {
    const parsed = parseSkillFile(
      '---\nname: pdf-toolkit\ndescription: PDF 工具\ncategory: tools\ntags:\n  - pdf\n  - file\nversion: 1.2.0\n---\n\n# 正文\n',
    );
    expect(parsed.status).toBe('ok');
    expect(parsed.frontmatter).toEqual({
      name: 'pdf-toolkit',
      description: 'PDF 工具',
      category: 'tools',
      tags: ['pdf', 'file'],
      version: '1.2.0',
    });
    expect(parsed.body).toContain('# 正文');
  });

  it('带 BOM 的文件可正常解析', () => {
    const parsed = parseSkillFile('﻿---\nname: bom-skill\n---\nbody');
    expect(parsed.status).toBe('ok');
    expect(parsed.frontmatter.name).toBe('bom-skill');
  });

  it('多行 description 正常解析', () => {
    const parsed = parseSkillFile(
      '---\nname: multi\ndescription: |\n  第一行\n  第二行\n---\nbody',
    );
    expect(parsed.status).toBe('ok');
    expect(parsed.frontmatter.description).toContain('第一行');
    expect(parsed.frontmatter.description).toContain('第二行');
  });

  it('坏 YAML 标记为 invalid 且不抛异常', () => {
    const parsed = parseSkillFile('---\nname: [unclosed\n---\nbody');
    expect(parsed.status).toBe('invalid');
    expect(parsed.error).toContain('YAML');
  });

  it('frontmatter 缺失标记为 invalid', () => {
    const parsed = parseSkillFile('# 没有 frontmatter 的技能\n正文');
    expect(parsed.status).toBe('invalid');
    expect(parsed.error).toBe('frontmatter 缺失');
  });

  it('缺少可选字段仍然有效', () => {
    const parsed = parseSkillFile('---\nname: only-name\n---\nbody');
    expect(parsed.status).toBe('ok');
    expect(parsed.frontmatter.name).toBe('only-name');
    expect(parsed.frontmatter.description).toBeUndefined();
    expect(parsed.frontmatter.tags).toBeUndefined();
  });

  it('空 frontmatter 视为有效', () => {
    const parsed = parseSkillFile('---\n---\nbody');
    expect(parsed.status).toBe('ok');
    expect(parsed.frontmatter).toEqual({
      name: undefined,
      description: undefined,
      category: undefined,
      tags: undefined,
      version: undefined,
    });
  });

  it('frontmatter 不是映射时标记 invalid', () => {
    const parsed = parseSkillFile('---\n- a\n- b\n---\nbody');
    expect(parsed.status).toBe('invalid');
  });
});