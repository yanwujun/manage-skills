import { Box, Typography } from '@mui/material';

export interface ReadOnlyViewProps {
  title: string;
}

/** 非同步类型资源：只读展示，明确没有编辑/同步入口。 */
export function ReadOnlyView({ title }: ReadOnlyViewProps) {
  return (
    <Box sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        当前版本仅支持查看该类型资源
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        仅供查看，不支持同步或编辑
      </Typography>
    </Box>
  );
}