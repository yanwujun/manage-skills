import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, utf8Encode } from '../src/index.js';

const nodeSha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256', () => {
  it('空字符串的已知向量', () => {
    expect(sha256Hex(utf8Encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('abc 的已知向量', () => {
    expect(sha256Hex(utf8Encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('中文与 emoji 与 Node crypto 一致', () => {
    for (const text of ['中文技能', '你好，世界', 'emoji 🎉 测试', 'a'.repeat(1000)]) {
      expect(sha256Hex(utf8Encode(text))).toBe(nodeSha256(text));
    }
  });

  it('同内容同 hash，不同内容不同 hash', () => {
    const a = sha256Hex(utf8Encode('same'));
    const b = sha256Hex(utf8Encode('same'));
    const c = sha256Hex(utf8Encode('same!'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});