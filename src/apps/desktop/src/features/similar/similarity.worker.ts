import { computeSimilarity, utf8Encode, type FileSystemReader, type SimilarityResult, type SkillRecord } from '@manage-skills/core';

export interface SimilarityWorkerRequest {
  id: number;
  records: SkillRecord[];
  contents: Record<string, string>;
  showThreshold: number;
  highThreshold?: number;
  ignoredPairs: string[];
}

export interface SimilarityWorkerResponse {
  id: number;
  result?: SimilarityResult;
  error?: string;
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

self.onmessage = async (event: MessageEvent<SimilarityWorkerRequest>) => {
  const { id, records, contents, showThreshold, highThreshold, ignoredPairs } = event.data;
  try {
    const result = await computeSimilarity(createMemoryFs(contents), records, {
      showThreshold,
      highThreshold,
      ignoredPairs,
    });
    const response: SimilarityWorkerResponse = { id, result };
    self.postMessage(response);
  } catch (err) {
    const response: SimilarityWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
