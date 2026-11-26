import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { diffText } from '@manage-skills/core';
import { useDataStore, useUiStore } from '../../store';
import { readTextFile } from '../../api/fs';
import { buildConflicts } from './conflicts';

interface DiffState {
  stats: { added: number; removed: number; changed: number };
  lines?: string[];
}

export function ConflictView() {
  const skills = useDataStore((state) => state.skills);
  const selections = useUiStore((state) => state.selections);
  const setSelection = useUiStore((state) => state.setSelection);
  const clearSelection = useUiStore((state) => state.clearSelection);

  const groups = useMemo(() => buildConflicts(skills), [skills]);
  const [active, setActive] = useState(0);
  const [diffs, setDiffs] = useState<Record<string, DiffState>>({});
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const group = groups[active];

  useEffect(() => {
    if (!group || group.sides.length < 2) return;
    const [left, right] = group.sides;
    if (!left || !right) return;
    let cancelled = false;
    setError('');
    void (async () => {
      try {
        const [a, b] = await Promise.all([readTextFile(left.path), readTextFile(right.path)]);
        if (cancelled) return;
        const result = diffText(a, b);
        setDiffs((current) => ({ ...current, [group.name]: { stats: result.stats } }));
      } catch {
        if (!cancelled) setError('无法读取文件内容（路径可能未授权）');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group]);

  const expandDiff = async (): Promise<void> => {
    if (!group || group.sides.length < 2) return;
    const [left, right] = group.sides;
    if (!left || !right) return;
    try {
      const [a, b] = await Promise.all([readTextFile(left.path), readTextFile(right.path)]);
      const result = diffText(a, b, { includeLines: true, maxLines: 40 });
      setDiffs((current) => ({ ...current, [group.name]: { stats: result.stats, lines: result.lines } }));
      setExpanded((current) => ({ ...current, [group.name]: true }));
    } catch {
      setError('无法读取完整内容（路径可能未授权）');
    }
  };

  if (groups.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          没有同名冲突
        </Typography>
      </Box>
    );
  }

  const diff = group ? diffs[group.name] : undefined;
  const selectedCount = Object.keys(selections).length;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 2 }}>
      <List dense sx={{ borderRight: 1, borderColor: 'divider', pr: 1 }}>
        {groups.map((item, index) => (
          <ListItemButton
            key={item.name}
            selected={index === active}
            onClick={() => setActive(index)}
            sx={{ borderRadius: 1 }}
          >
            <ListItemText
              primary={item.name}
              secondary={`${item.sides.length} 个版本${selections[item.name] ? ' · 已选' : ''}`}
            />
          </ListItemButton>
        ))}
      </List>

      <Box>
        {group && (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle1">{group.name}</Typography>
              <Chip size="small" label={`${group.sides.length} 个版本`} />
              {selections[group.name] && (
                <Chip
                  size="small"
                  color="primary"
                  label={selections[group.name] === 'skip' ? '已标记跳过' : '已选择保留'}
                />
              )}
            </Stack>

            <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
              {group.sides.map((side) => (
                <Paper key={side.path} variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 260 }}>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                      {side.agent} · {side.instanceId}
                    </Typography>
                    {side.link === 'symlink' && <Chip size="small" color="info" label="symlink" />}
                  </Stack>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                    {side.hash.slice(0, 12)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {new Date(side.mtimeMs).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {side.path}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant={selections[group.name] === side.path ? 'contained' : 'outlined'}
                      onClick={() => setSelection(group.name, side.path)}
                    >
                      保留此版本
                    </Button>
                  </Stack>
                </Paper>
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />

            {error && <Alert severity="warning" sx={{ mb: 1 }}>{error}</Alert>}
            {diff ? (
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body2">
                  差异统计：+{diff.stats.added} -{diff.stats.removed} ~{diff.stats.changed}
                </Typography>
                <Button size="small" onClick={() => void expandDiff()}>
                  {expanded[group.name] ? '重新载入差异' : '展开差异'}
                </Button>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                正在计算差异…
              </Typography>
            )}

            {diff?.lines && diff.lines.length > 0 && (
              <Box
                component="pre"
                sx={{
                  mt: 1,
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontSize: 12,
                  overflow: 'auto',
                  maxHeight: 240,
                }}
              >
                {diff.lines.join('\n')}
              </Box>
            )}

            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button size="small" onClick={() => setSelection(group.name, 'skip')}>
                标记跳过
              </Button>
              <Button
                size="small"
                onClick={() => clearSelection(group.name)}
                disabled={!selections[group.name]}
              >
                撤销选择
              </Button>
            </Stack>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              已选 {selectedCount} 项；选边只记录在当前会话，进入同步队列后才会写盘。
            </Typography>
          </>
        )}
      </Box>
    </Box>
  );
}