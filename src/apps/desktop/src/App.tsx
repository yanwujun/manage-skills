import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { open } from '@tauri-apps/plugin-dialog';
import { REGISTERED_ADAPTERS, parseSkillFile, type SkillRecord } from '@manage-skills/core';
import { useDataStore, useUiStore, VIEW_LABELS, type ViewKey } from './store';
import { allowRoot, appPaths, listWslDistros, readTextFile, type WslDistro } from './api/fs';
import { scanSkills, type ScanProgress } from './api/scan';
import { scanAndSaveIndex } from './api/adapter';
import { SkillList } from './features/catalog/SkillList';
import { ReadOnlyView } from './features/catalog/ReadOnlyView';
import { ConflictView } from './features/conflicts/ConflictView';
import { SimilarView } from './features/similar/SimilarView';
import { SyncView } from './features/sync/SyncView';

const SAMPLE = '---\nname: demo\ndescription: 解析样例\n---\n\n正文内容';

const NAV_GROUPS: Array<{ title: string; views: ViewKey[] }> = [
  { title: '资源', views: ['skills', 'commands', 'memory', 'mcp', 'hooks', 'subagents'] },
  { title: '治理', views: ['conflicts', 'similar', 'sync'] },
  { title: '系统', views: ['settings'] },
];

export default function App() {
  const parsed = useMemo(() => parseSkillFile(SAMPLE), []);
  const view = useUiStore((state) => state.view);
  const setView = useUiStore((state) => state.setView);
  const skills = useDataStore((state) => state.skills);
  const setSkills = useDataStore((state) => state.setSkills);

  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState('');
  const [wsl, setWsl] = useState<WslDistro[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [scan, setScan] = useState<ScanProgress | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const paths = await appPaths();
      let next: SkillRecord[] = [];
      let generated = '';
      try {
        const text = await readTextFile(paths.index);
        const index = JSON.parse(text) as { skills?: SkillRecord[]; generatedAt?: string };
        next = index.skills ?? [];
        generated = index.generatedAt ?? '';
      } catch {
        // 索引不存在：首次使用
      }
      setSkills(next);
      setGeneratedAt(generated);
      setWsl(await listWslDistros());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onScan = async (): Promise<void> => {
    setScan({ scanned: 0, found: 0, done: false });
    try {
      const found = await scanSkills((progress) => setScan(progress));
      const result = await scanAndSaveIndex();
      setSkills(result.skills);
      setMessage(`扫描完成：发现 ${found} 个 SKILL.md，索引已更新（${result.skills.length} 条）`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScan((current) => (current ? { ...current, done: true } : null));
    }
  };

  const onAddRoot = async (): Promise<void> => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      await allowRoot(selected);
      setMessage(`已授权扫描根：${selected}`);
    }
  };

  const selections = useUiStore((state) => state.selections);

  const counts: Record<string, number> = {
    skills: skills.length,
    commands: 0,
    memory: 0,
    mcp: 0,
    hooks: 0,
    subagents: 0,
    sync: Object.keys(selections).length,
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <Box sx={{ width: 208, flex: 'none', borderRight: 1, borderColor: 'divider', p: 1, overflow: 'auto' }}>
        <Typography sx={{ px: 1, py: 1, fontWeight: 600 }}>manage-skills</Typography>
        {NAV_GROUPS.map((group) => (
          <Box key={group.title} sx={{ mb: 1 }}>
            <Typography sx={{ px: 1, pt: 1, pb: 0.5, fontSize: 11, color: 'text.secondary' }}>
              {group.title}
            </Typography>
            <List dense disablePadding>
              {group.views.map((key) => (
                <ListItemButton
                  key={key}
                  selected={view === key}
                  onClick={() => setView(key)}
                  sx={{ borderRadius: 1, mx: 0.5 }}
                >
                  <ListItemText primary={VIEW_LABELS[key]} />
                  {key in counts && (
                    <Typography variant="caption" color="text.secondary">
                      {counts[key]}
                    </Typography>
                  )}
                </ListItemButton>
              ))}
            </List>
          </Box>
        ))}
      </Box>

      <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Typography variant="h6">{VIEW_LABELS[view]}</Typography>
          <Typography variant="caption" color="text.secondary">
            {generatedAt ? `索引生成于 ${generatedAt}` : '尚未生成索引'}
          </Typography>
        </Stack>

        {loading && <LinearProgress sx={{ my: 2 }} />}
        {scan && !scan.done && (
          <Box sx={{ my: 2 }}>
            <LinearProgress variant="determinate" value={Math.min(100, scan.scanned)} />
            <Typography variant="caption" color="text.secondary">
              扫描中：{scan.scanned} 个目录 · 发现 {scan.found} 个技能
            </Typography>
          </Box>
        )}
        {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
        {message && <Alert severity="success" sx={{ my: 2 }}>{message}</Alert>}

        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          {REGISTERED_ADAPTERS.map((id) => (
            <Chip key={id} label={id} size="small" variant="outlined" />
          ))}
          {wsl.length > 0 && (
            <Chip
              size="small"
              variant="outlined"
              label={`WSL: ${wsl.map((item) => `${item.name}${item.reachable ? '' : '(不可达)'}`).join(' ')}`}
            />
          )}
          <Chip size="small" variant="outlined" label={`样例解析 ${parsed.status}`} />
        </Stack>
        <Divider sx={{ mb: 2 }} />

        {view === 'skills' ? (
          <SkillList />
        ) : view === 'conflicts' ? (
          <ConflictView />
        ) : view === 'similar' ? (
          <SimilarView />
        ) : view === 'sync' ? (
          <SyncView />
        ) : (
          <ReadOnlyView title={VIEW_LABELS[view]} />
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="outlined" size="small" onClick={() => void load()} disabled={loading}>
            重新读取索引
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => void onScan()}
            disabled={Boolean(scan && !scan.done)}
          >
            扫描刷新
          </Button>
          <Button variant="outlined" size="small" onClick={() => void onAddRoot()}>
            添加扫描根…
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}