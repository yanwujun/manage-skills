const WINDOWS_PATH = /^([A-Za-z]:[\\/]|\\\\)/;

export function isWindowsPath(path: string): boolean {
  return WINDOWS_PATH.test(path);
}

function separatorOf(path: string): string {
  return isWindowsPath(path) ? '\\' : '/';
}

function stripTrailing(path: string): string {
  let result = path;
  while (result.length > 1 && (result.endsWith('/') || result.endsWith('\\'))) {
    result = result.slice(0, -1);
  }
  return result;
}

/** 拼接路径片段，分隔符由基准路径决定；不解析 `.` 与 `..`。 */
export function joinPath(base: string, ...segments: string[]): string {
  const sep = separatorOf(base);
  let result = stripTrailing(base);
  for (const segment of segments) {
    const clean = segment
      .replace(/^[\\/]+/, '')
      .replace(/[\\/]+$/, '')
      .replace(/[\\/]+/g, sep);
    if (!clean) continue;
    result = result.endsWith(sep) ? `${result}${clean}` : `${result}${sep}${clean}`;
  }
  return result;
}

/** 统一分隔符并去掉末尾分隔符。 */
export function normalizePath(path: string): string {
  const sep = separatorOf(path);
  return stripTrailing(path.replace(/[\\/]+/g, sep));
}

/** 判断 child 是否位于 parent 之下（含相等）。Windows 下忽略大小写。 */
export function isUnderPath(child: string, parent: string, caseInsensitive = false): boolean {
  const c = caseInsensitive ? normalizePath(child).toLowerCase() : normalizePath(child);
  const p = caseInsensitive ? normalizePath(parent).toLowerCase() : normalizePath(parent);
  if (c === p) return true;
  const sep = separatorOf(p);
  return c.startsWith(p.endsWith(sep) ? p : `${p}${sep}`);
}

/** 比较两个路径是否指向同一位置。 */
export function isSamePath(a: string, b: string, caseInsensitive = false): boolean {
  const na = normalizePath(a);
  const nb = normalizePath(b);
  return caseInsensitive ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

/** 取路径最后一段。 */
export function baseName(path: string): string {
  const normalized = normalizePath(path);
  const sep = separatorOf(normalized);
  const index = normalized.lastIndexOf(sep);
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

/** 取父目录；盘符根（C:\）单独处理。 */
export function dirName(path: string): string {
  const normalized = normalizePath(path);
  const sep = separatorOf(normalized);
  const index = normalized.lastIndexOf(sep);
  if (index < 0) return normalized;
  if (index === 2 && /^[A-Za-z]:[\\/]/.test(normalized)) return normalized.slice(0, 3);
  if (index === 0) return sep;
  return normalized.slice(0, index);
}

/** 计算 path 相对 base 的路径；不在 base 之下时原样返回。 */
export function relativeTo(path: string, base: string, caseInsensitive = false): string {
  const normalizedPath = normalizePath(path);
  const normalizedBase = normalizePath(base);
  const sep = separatorOf(normalizedBase);
  const cmpPath = caseInsensitive ? normalizedPath.toLowerCase() : normalizedPath;
  const cmpBase = caseInsensitive ? normalizedBase.toLowerCase() : normalizedBase;
  if (cmpPath === cmpBase) return '';
  const prefix = cmpBase.endsWith(sep) ? cmpBase : `${cmpBase}${sep}`;
  if (!cmpPath.startsWith(prefix)) return normalizedPath;
  return normalizedPath.slice(prefix.length);
}