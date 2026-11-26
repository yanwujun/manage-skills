import { create } from 'zustand';
import type { AgentId, SkillRecord } from '@manage-skills/core';

export type ViewKey =
  | 'skills'
  | 'commands'
  | 'memory'
  | 'mcp'
  | 'hooks'
  | 'subagents'
  | 'conflicts'
  | 'similar'
  | 'sync'
  | 'settings';

export interface UiFilters {
  source: AgentId | '';
  state: '' | 'ok' | 'invalid' | 'stale' | 'drift';
  tags: string[];
}

interface UiState {
  view: ViewKey;
  search: string;
  filters: UiFilters;
  /** 同名冲突或相似组的选边：技能名 -> 保留的实例路径，或 'skip' */
  selections: Record<string, string>;
  /** 已忽略的相似对（无序键 a::b） */
  ignoredPairs: string[];
  /** 相似组展示阈值（默认 0.6） */
  similarityThreshold: number;
  setView: (view: ViewKey) => void;
  setSearch: (search: string) => void;
  setFilters: (filters: Partial<UiFilters>) => void;
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  resetFilters: () => void;
  setSelection: (name: string, value: string) => void;
  clearSelection: (name: string) => void;
  ignorePair: (a: string, b: string) => void;
  unignorePair: (key: string) => void;
  setSimilarityThreshold: (threshold: number) => void;
}

export function makePairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const EMPTY_FILTERS: UiFilters = { source: '', state: '', tags: [] };

export const useUiStore = create<UiState>((set) => ({
  view: 'skills',
  search: '',
  filters: EMPTY_FILTERS,
  selections: {},
  ignoredPairs: [],
  similarityThreshold: 0.6,
  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  toggleTag: (tag) =>
    set((state) => {
      const has = state.filters.tags.includes(tag);
      return {
        filters: {
          ...state.filters,
          tags: has
            ? state.filters.tags.filter((item) => item !== tag)
            : [...state.filters.tags, tag],
        },
      };
    }),
  clearTags: () =>
    set((state) => ({ filters: { ...state.filters, tags: [] } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  setSelection: (name, value) =>
    set((state) => ({ selections: { ...state.selections, [name]: value } })),
  clearSelection: (name) =>
    set((state) => {
      const next = { ...state.selections };
      delete next[name];
      return { selections: next };
    }),
  ignorePair: (a, b) =>
    set((state) => {
      const key = makePairKey(a, b);
      if (state.ignoredPairs.includes(key)) return state;
      return { ignoredPairs: [...state.ignoredPairs, key] };
    }),
  unignorePair: (key) =>
    set((state) => ({
      ignoredPairs: state.ignoredPairs.filter((item) => item !== key),
    })),
  setSimilarityThreshold: (threshold) =>
    set({ similarityThreshold: Math.max(0.1, Math.min(1, Number(threshold.toFixed(2)))) }),
}));

export const VIEW_LABELS: Record<ViewKey, string> = {
  skills: '技能',
  commands: '指令',
  memory: '记忆',
  mcp: 'MCP',
  hooks: 'Hooks',
  subagents: '子代理',
  conflicts: '同名冲突',
  similar: '相似组',
  sync: '同步队列',
  settings: '设置',
};

interface DataState {
  skills: SkillRecord[];
  setSkills: (skills: SkillRecord[]) => void;
}

export const useDataStore = create<DataState>((set) => ({
  skills: [],
  setSkills: (skills) => set({ skills }),
}));