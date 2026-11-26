import { useMemo, useRef, useState } from 'react';
import { Box, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import { effectiveTags } from '@manage-skills/core';
import { useDataStore, useUiStore } from '../../store';
import { SkillCard } from './SkillCard';
import { TagPanel } from './TagPanel';

const ROW_HEIGHT = 116;

export function SkillList() {
  const skills = useDataStore((state) => state.skills);
  const search = useUiStore((state) => state.search);
  const setSearch = useUiStore((state) => state.setSearch);
  const filters = useUiStore((state) => state.filters);
  const setFilters = useUiStore((state) => state.setFilters);
  const toggleTag = useUiStore((state) => state.toggleTag);
  const clearTags = useUiStore((state) => state.clearTags);
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return skills.filter((record) => {
      const name = record.frontmatter.name ?? record.relativePath;
      if (keyword && !name.toLowerCase().includes(keyword) && !(record.frontmatter.description ?? '').toLowerCase().includes(keyword)) {
        return false;
      }
      if (filters.source && record.agent !== filters.source) return false;
      if (filters.state === 'invalid' && record.status !== 'invalid') return false;
      if (filters.state === 'stale' && !record.stale) return false;
      if (filters.state === 'ok' && (record.status === 'invalid' || record.stale)) return false;
      if (filters.tags.length > 0) {
        const tags = new Set(effectiveTags(record));
        if (!filters.tags.every((tag) => tags.has(tag))) return false;
      }
      return true;
    });
  }, [skills, search, filters]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="搜索名称或描述…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: 220 }}
        />
        <Select
          size="small"
          displayEmpty
          value={filters.source}
          onChange={(event) => setFilters({ source: event.target.value as typeof filters.source })}
        >
          <MenuItem value="">全部来源</MenuItem>
          <MenuItem value="claude-code">Claude Code</MenuItem>
          <MenuItem value="cursor">Cursor</MenuItem>
          <MenuItem value="codex">Codex</MenuItem>
          <MenuItem value="hermes">Hermes</MenuItem>
        </Select>
        <Select
          size="small"
          displayEmpty
          value={filters.state}
          onChange={(event) => setFilters({ state: event.target.value as typeof filters.state })}
        >
          <MenuItem value="">全部状态</MenuItem>
          <MenuItem value="ok">正常</MenuItem>
          <MenuItem value="invalid">invalid</MenuItem>
          <MenuItem value="stale">stale</MenuItem>
        </Select>
        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {filtered.length} / {skills.length}
        </Typography>
      </Stack>

      <TagPanel
        skills={skills}
        selectedTags={filters.tags}
        onToggleTag={toggleTag}
        onClearTags={clearTags}
      />

      <Box
        ref={parentRef}
        sx={{ height: 'calc(100vh - 300px)', minHeight: 240, overflow: 'auto', pr: 0.5 }}
      >
        {filtered.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              没有匹配的技能
            </Typography>
          </Box>
        ) : (
          <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const record = filtered[item.index];
              if (!record) return null;
              return (
                <Box
                  key={item.key}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    px: 0.25,
                    pb: 1,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <SkillCard
                    record={record}
                    selected={selected === record.path}
                    onSelect={() => setSelected(record.path)}
                  />
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}