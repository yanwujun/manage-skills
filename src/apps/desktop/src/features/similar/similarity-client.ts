import {
  computeSimilarity,
  effectiveTags,
  utf8Encode,
  type FileSystemReader,
  type SimilarityGroup,
  type SimilarityResult,
  type SkillRecord,
} from '@manage-skills/core';
import type { SimilarityWorkerRequest, SimilarityWorkerResponse } from './similarity.worker';

let workerInstance: Worker | null = null;
let requestSeq = 0;

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!workerInstance) {
    workerInstance = new Worker(new URL('./similarity.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return workerInstance;
}

function createMemoryFs(contents: Record<string, string>): FileSystemReader {
  return {
    async readFile(path: string): Promise<Uint8Array> {
      const value = contents[path];
      if (value === undefined) throw new Error(`File not loaded: ${path}`);
      return utf8Encode(value);
    },
    async readTextFile(path: string): Promise<string> {
      const value = contents[path];
      if (value === undefined) throw new Error(`File not loaded: ${path}`);
      return value;
    },
    async readDir() {
      return [];
    },
    async stat(path: string) {
      if (!(path in contents)) return null;
      return { size: contents[path]!.length, mtimeMs: 0, isFile: true, isDirectory: false, isSymbolicLink: false };
    },
  };
}

export async function runSimilarityInWorker(params: {
  records: SkillRecord[];
  contents: Record<string, string>;
  showThreshold: number;
  highThreshold?: number;
  ignoredPairs: string[];
}): Promise<SimilarityResult> {
  const worker = getWorker();
  if (!worker) {
    return computeSimilarity(createMemoryFs(params.contents), params.records, {
      showThreshold: params.showThreshold,
      highThreshold: params.highThreshold,
      ignoredPairs: params.ignoredPairs,
    });
  }

  const id = ++requestSeq;
  return new Promise<SimilarityResult>((resolve, reject) => {
    const onMessage = (event: MessageEvent<SimilarityWorkerResponse>) => {
      if (event.data.id !== id) return;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error('Empty worker response'));
    };
    const onError = (err: ErrorEvent) => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      reject(new Error(err.message || 'Worker execution failed'));
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    const payload: SimilarityWorkerRequest = { id, ...params };
    worker.postMessage(payload);
  });
}

/** 按标签筛选相似组：组内至少有一个成员包含全部已选标签。 */
export function filterGroupsByTags(
  groups: SimilarityGroup[],
  recordsByPath: Map<string, SkillRecord>,
  selectedTags: string[],
): SimilarityGroup[] {
  if (selectedTags.length === 0) return groups;
  return groups.filter((group) =>
    group.members.some((memberPath) => {
      const record = recordsByPath.get(memberPath);
      if (!record) return false;
      const tags = new Set(effectiveTags(record));
      return selectedTags.every((tag) => tags.has(tag));
    }),
  );
}
