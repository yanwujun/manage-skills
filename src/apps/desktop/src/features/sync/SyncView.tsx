import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { appPaths, readTextFile } from '../../api/fs';
import { scanAndSaveIndex } from '../../api/adapter';
import type { SkillRecord } from '@manage-skills/core';
import { useDataStore, useUiStore } from '../../store';
import { buildSyncQueue, summarizeQueue } from './queue';
import { executeSyncQueue, type SyncOutcome } from './execute';

type Phase = 'idle' | 'preview' | 'running' | 'done';

export function SyncView() {
  const skills = useDataStore((state) => state.skills);
  const setSkills = useDataStore((state) => state.setSkills);
  const selections = useUiStore((state) => state.selections);
  const clearSelection = useUiStore((state) => state.clearSelection);

  const queue = useMemo(() => buildSyncQueue(skills, selections), [skills, selections]);
  const counts = useMemo(() => summarizeQueue(queue), [queue]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refreshIndex = async (): Promise<void> => {
    try {
      const result = await scanAndSaveIndex();
      setSkills(result.skills);
    } catch {
      const paths = await appPaths();
      try {
        const text = await readTextFile(paths.index);
        const index = JSON.parse(text) as { skills?: SkillRecord[] };
        setSkills(index.skills ?? []);
      } catch {
        // 索引不存在时保持现状
      }
    }
  };

  const onExecute = async (): Promise<void> => {
    setPhase('running');
    setError('');
    setProgress({ done: 0, total: queue.length });
    try {
      const result = await executeSyncQueue(queue, (done, total) => setProgress({ done, total }));
      setOutcome(result);
      for (const item of queue) clearSelection(item.skillName);
      await refreshIndex();
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('idle');
    }
  };

  const copyRestoreCommand = async (): Promise<void> => {
    if (!outcome?.backupDir) return;
    const command = `manage-skills sync restore --backup "${outcome.backupDir}"`;
    try {
      await navigator.clipboard.writeText(command);
      setMessage('恢复命令已复制');
    } catch {
      setMessage(command);
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}

      {phase === 'done' && outcome ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>执行结果</Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            <Chip color="success" label={`created ${outcome.summary.created}`} />
            <Chip color="success" variant="outlined" label={`updated ${outcome.summary.updated}`} />
            <Chip label={`skipped ${outcome.summary.skipped}`} />
            <Chip
              color={outcome.summary.failed > 0 ? 'error' : 'default'}
              label={`failed ${outcome.summary.failed}`}
            />
          </Stack>
          {outcome.results
            .filter((item) => item.status === 'failed')
            .map((item) => (
              <Typography key={item.id} variant="body2" color="error">
                [failed] {item.skillName}：{item.reason ?? ''}
              </Typography>
            ))}
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2" color="text.secondary">
            备份目录：{outcome.backupDir}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <Button size="small" variant="outlined" onClick={() => void copyRestoreCommand()}>
              复制恢复命令
            </Button>
            <Button size="small" onClick={() => { setPhase('idle'); setOutcome(null); }}>
              返回队列
            </Button>
          </Stack>
        </Paper>
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="subtitle1">待执行队列</Typography>
            <Chip size="small" label={`${queue.length} 条`} />
            {phase === 'preview' && <Chip size="small" color="warning" label="预演确认" />}
          </Stack>

          {queue.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                暂无待同步项
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                在「同名冲突」或「相似组」中选择要保留的版本后，条目会出现在这里
              </Typography>
            </Box>
          ) : (
            <Paper variant="outlined" sx={{ mb: 2 }}>
              {queue.map((item) => (
                <Box key={item.id} sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.skillName}</Typography>
                    <Chip size="small" variant="outlined" label={item.direction} />
                    <Chip size="small" variant="outlined" label={item.action} />
                    <Chip size="small" variant="outlined" label={item.linkMode} />
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                      {item.targetInstance}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                    {item.sourcePath} → {item.targetPath}
                  </Typography>
                </Box>
              ))}
            </Paper>
          )}

          {phase === 'preview' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                预演汇总：创建 {counts.create} / 更新 {counts.update} / 跳过 {counts.skip}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                执行前会逐条备份到 ~/.manage-skills/backups/，不会删除任何文件；点击「取消」不会产生任何写入。
              </Typography>
              {queue.map((item) => (
                <Typography key={item.id} variant="caption" sx={{ display: 'block' }}>
                  [{item.action}] {item.targetPath}
                </Typography>
              ))}
            </Alert>
          )}

          {phase === 'running' && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress
                variant="determinate"
                value={progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}
              />
              <Typography variant="caption" color="text.secondary">
                执行中：{progress.done} / {progress.total}
              </Typography>
            </Box>
          )}

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              disabled={queue.length === 0 || phase === 'running'}
              onClick={() => setPhase(phase === 'preview' ? 'idle' : 'preview')}
            >
              预演
            </Button>
            <Button
              variant="contained"
              size="small"
              disabled={queue.length === 0 || phase !== 'preview'}
              onClick={() => void onExecute()}
            >
              确认并执行
            </Button>
            {phase === 'preview' && (
              <Button size="small" onClick={() => setPhase('idle')}>
                取消
              </Button>
            )}
          </Stack>
        </>
      )}
    </Box>
  );
}
