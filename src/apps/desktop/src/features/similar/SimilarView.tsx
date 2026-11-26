import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Paper,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import { effectiveTags, type SimilarityGroup, type SkillRecord } from '@manage-skills/core';
import { useDataStore, useUiStore } from '../../store';
import { readTextFile } from '../../api/fs';
import { TagPanel } from '../catalog/TagPanel';
import { filterGroupsByTags, runSimilarityInWorker } from './similarity-client';

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function SimilarView() {
  const skills = useDataStore((state) => state.skills);
  const ignoredPairs = useUiStore((state) => state.ignoredPairs);
  const ignorePair = useUiStore((state) => state.ignorePair);
  const unignorePair = useUiStore((state) => state.unignorePair);
  const threshold = useUiStore((state) => state.similarityThreshold);
  const setThreshold = useUiStore((state) => state.setSimilarityThreshold);
  const setSelection = useUiStore((state) => state.setSelection);
  const selections = useUiStore((state) => state.selections);

  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [groups, setGroups] = useState<SimilarityGroup[]>([]);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detailRecord, setDetailRecord] = useState<SkillRecord | null>(null);

  const recordsByPath = useMemo(
    () => new Map(skills.map((record) => [record.path, record])),
    [skills],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (skills.length < 2) {
        setGroups([]);
        return;
      }
      setComputing(true);
      setError('');
      try {
        const contents: Record<string, string> = {};
        for (const record of skills) {
          try {
            contents[record.path] = await readTextFile(record.path);
          } catch {
            // 不可读文件跳过
          }
        }
        const result = await runSimilarityInWorker({
          records: skills,
          contents,
          showThreshold: threshold,
          ignoredPairs,
        });
        if (!cancelled) {
          const sorted = [...result.groups].sort((a, b) => b.score - a.score);
          setGroups(sorted);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setComputing(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [skills, threshold, ignoredPairs]);

  const visibleGroups = useMemo(
    () => filterGroupsByTags(groups, recordsByPath, selectedTags),
    [groups, recordsByPath, selectedTags],
  );

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  };

  const handleQueueKeep = (record: SkillRecord) => {
    const name = record.frontmatter.name ?? record.relativePath;
    setSelection(name, record.path);
    setNotice(`已将「${name}」（${record.agent}）加入同步队列，尚未写入磁盘。`);
  };

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          展示阈值：{threshold.toFixed(2)}
        </Typography>
        <Box sx={{ width: 180 }}>
          <Slider
            size="small"
            min={0.3}
            max={0.95}
            step={0.05}
            value={threshold}
            onChange={(_, value) => {
              if (typeof value === 'number') setThreshold(value);
            }}
            aria-label="相似度展示阈值"
          />
        </Box>
        <Typography variant="caption" color="text.secondary">
          共 {visibleGroups.length} 组相似技能
          {ignoredPairs.length > 0 ? ` · 已忽略 ${ignoredPairs.length} 对` : ''}
        </Typography>
        {ignoredPairs.length > 0 && (
          <Button
            size="small"
            variant="text"
            onClick={() => ignoredPairs.forEach((key) => unignorePair(key))}
          >
            撤销全部忽略
          </Button>
        )}
      </Stack>

      <TagPanel
        skills={skills}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onClearTags={() => setSelectedTags([])}
        label="按标签过滤相似组"
      />

      {computing && (
        <Box sx={{ my: 1.5 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary">
            正在后台 Worker 计算相似度…
          </Typography>
        </Box>
      )}
      {error && <Alert severity="error" sx={{ my: 1.5 }}>{error}</Alert>}
      {notice && (
        <Alert severity="info" sx={{ my: 1.5 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      {!computing && visibleGroups.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', mt: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            未发现近似重复
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            当前展示阈值为 {threshold.toFixed(2)}，所有技能相似度均低于该阈值
            {selectedTags.length > 0 ? '（或未匹配当前标签筛选）' : ''}。
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center">
            {threshold > 0.4 && (
              <Button size="small" variant="outlined" onClick={() => setThreshold(Number((threshold - 0.1).toFixed(2)))}>
                降低阈值至 {Math.max(0.3, threshold - 0.1).toFixed(2)}
              </Button>
            )}
            {selectedTags.length > 0 && (
              <Button size="small" variant="outlined" onClick={() => setSelectedTags([])}>
                清除标签筛选
              </Button>
            )}
          </Stack>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {visibleGroups.map((group) => (
            <Accordion key={group.id} variant="outlined" disableGutters>
              <AccordionSummary>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%', flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    color={group.score >= 0.8 ? 'warning' : 'default'}
                    label={`最高 ${formatScore(group.score)}`}
                  />
                  <Typography variant="subtitle2">
                    {group.members
                      .map((path) => recordsByPath.get(path)?.frontmatter.name ?? path)
                      .join(' / ')}
                  </Typography>
                  <Chip size="small" variant="outlined" label={`${group.members.length} 个技能`} />
                  {group.chained && (
                    <Chip size="small" color="info" variant="outlined" label="链式相似（非全互连）" />
                  )}
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                {group.chained && (
                  <Alert severity="info" sx={{ mb: 1.5 }}>
                    该组为链式相似：组内并非所有技能都两两相似，请结合下方两两分数逐对确认。
                  </Alert>
                )}

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  参与技能（默认折叠正文）
                </Typography>
                <Stack spacing={1} sx={{ mb: 2 }}>
                  {group.members.map((memberPath) => {
                    const record = recordsByPath.get(memberPath);
                    if (!record) return null;
                    const name = record.frontmatter.name ?? record.relativePath;
                    const tags = effectiveTags(record);
                    const queued = selections[name] === record.path;
                    return (
                      <Paper key={memberPath} variant="outlined" sx={{ p: 1.25 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ flexWrap: 'wrap' }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                              <Typography variant="subtitle2">{name}</Typography>
                              <Chip size="small" variant="outlined" label={record.agent} />
                              {tags.map((tag) => (
                                <Chip key={tag} size="small" label={tag} />
                              ))}
                            </Stack>
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {record.frontmatter.description ?? '—'}
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" onClick={() => setDetailRecord(record)}>
                              查看详情
                            </Button>
                            <Button
                              size="small"
                              variant={queued ? 'contained' : 'outlined'}
                              onClick={() => handleQueueKeep(record)}
                            >
                              {queued ? '已在同步队列' : '保留并加入队列'}
                            </Button>
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>

                <Divider sx={{ my: 1.5 }} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  两两相似度明细
                </Typography>
                <Stack spacing={1}>
                  {group.pairs.map((pair) => {
                    const aName = recordsByPath.get(pair.a)?.frontmatter.name ?? pair.a;
                    const bName = recordsByPath.get(pair.b)?.frontmatter.name ?? pair.b;
                    return (
                      <Stack
                        key={`${pair.a}-${pair.b}`}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={1}
                        sx={{ flexWrap: 'wrap' }}
                      >
                        <Typography variant="body2">
                          {aName} ↔ {bName} · 总分 {formatScore(pair.score)}（描述 {formatScore(pair.descriptionScore)} / 正文 {formatScore(pair.bodyScore)}）
                        </Typography>
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => ignorePair(pair.a, pair.b)}
                        >
                          标记不是重复
                        </Button>
                      </Stack>
                    );
                  })}
                </Stack>
              </AccordionDetails>
            </Accordion>
          ))}
        </Stack>
      )}

      <Dialog open={Boolean(detailRecord)} onClose={() => setDetailRecord(null)} maxWidth="sm" fullWidth>
        {detailRecord && (
          <>
            <DialogTitle>{detailRecord.frontmatter.name ?? detailRecord.relativePath}</DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1}>
                <Typography variant="body2">来源：{detailRecord.agent}</Typography>
                <Typography variant="body2">路径：{detailRecord.path}</Typography>
                <Typography variant="body2">描述：{detailRecord.frontmatter.description ?? '—'}</Typography>
                <Typography variant="body2">内容 Hash：{detailRecord.hash}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  {effectiveTags(detailRecord).map((tag) => (
                    <Chip key={tag} size="small" label={tag} />
                  ))}
                </Stack>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailRecord(null)}>关闭</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
