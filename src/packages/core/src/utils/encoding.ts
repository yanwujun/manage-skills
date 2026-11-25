/** 纯 TS 的 UTF-8 编码，避免依赖 TextEncoder（保持 core 平台无关）。 */
export function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

/** 纯 TS 的 UTF-8 解码。 */
export function utf8Decode(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i]!;
    if (b1 < 0x80) {
      result += String.fromCharCode(b1);
      i += 1;
    } else if (b1 < 0xe0) {
      const b2 = bytes[i + 1] ?? 0;
      result += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      i += 2;
    } else if (b1 < 0xf0) {
      const b2 = bytes[i + 1] ?? 0;
      const b3 = bytes[i + 2] ?? 0;
      result += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      i += 3;
    } else {
      const b2 = bytes[i + 1] ?? 0;
      const b3 = bytes[i + 2] ?? 0;
      const b4 = bytes[i + 3] ?? 0;
      const code = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      result += String.fromCodePoint(code);
      i += 4;
    }
  }
  return result;
}