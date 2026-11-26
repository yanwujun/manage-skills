import { Chip, Paper, Stack, Typography } from '@mui/material';
import { effectiveTags, type SkillRecord } from '@manage-skills/core';

export interface SkillCardProps {
  record: SkillRecord;
  selected: boolean;
  onSelect: () => void;
}

export function SkillCard({ record, selected, onSelect }: SkillCardProps) {
  const name = record.frontmatter.name ?? record.relativePath;
  const tags = effectiveTags(record);

  return (
    <Paper
      variant="outlined"
      onClick={onSelect}
      sx={{
        p: 1.5,
        cursor: 'pointer',
        borderColor: selected ? 'primary.main' : undefined,
        '&:hover': { borderColor: 'primary.light' },
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
        <Typography variant="subtitle2">{name}</Typography>
        {record.status === 'invalid' && <Chip size="small" color="error" label="invalid" />}
        {record.stale && <Chip size="small" label="stale" />}
        {record.link === 'symlink' && <Chip size="small" color="info" label="symlink" />}
        {record.frontmatter.category && (
          <Chip size="small" color="secondary" variant="outlined" label={record.frontmatter.category} />
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
        {record.frontmatter.description ?? '—'}
      </Typography>

      <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" variant="outlined" label={record.agent} />
        <Chip size="small" variant="outlined" label={record.link === 'symlink' ? 'symlink' : 'copy'} />
        {tags.map((tag) => (
          <Chip key={tag} size="small" variant="outlined" label={tag} />
        ))}
      </Stack>

      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', mt: 0.5 }}>
        {record.path}
      </Typography>
    </Paper>
  );
}