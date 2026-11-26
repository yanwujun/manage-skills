import { useMemo, useState } from 'react';
import { Button, Chip, Stack, Typography } from '@mui/material';
import { tagCounts, type SkillRecord } from '@manage-skills/core';

export interface TagPanelProps {
  skills: SkillRecord[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  label?: string;
  initialLimit?: number;
}

export function TagPanel({
  skills,
  selectedTags,
  onToggleTag,
  onClearTags,
  label = '标签筛选',
  initialLimit = 24,
}: TagPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const allTags = useMemo(() => tagCounts(skills), [skills]);

  if (allTags.length === 0) return null;

  const visible = expanded ? allTags : allTags.slice(0, initialLimit);
  const hasMore = allTags.length > initialLimit;

  return (
    <Stack direction="row" spacing={0.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        {label}（{allTags.length}）
      </Typography>
      {visible.map((item) => {
        const active = selectedTags.includes(item.tag);
        return (
          <Chip
            key={item.tag}
            size="small"
            label={`${item.tag} (${item.count})`}
            color={active ? 'primary' : 'default'}
            variant={active ? 'filled' : 'outlined'}
            onClick={() => onToggleTag(item.tag)}
          />
        );
      })}
      {hasMore && (
        <Button size="small" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? '收起' : `展开全部 (${allTags.length})`}
        </Button>
      )}
      {selectedTags.length > 0 && (
        <Chip size="small" label={`清除已选 (${selectedTags.length})`} variant="outlined" onClick={onClearTags} />
      )}
    </Stack>
  );
}
