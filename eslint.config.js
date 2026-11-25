import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'tmp/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:fs',
                'node:fs/promises',
                'fs',
                'fs/promises',
                'node:child_process',
                'child_process',
                'node:os',
                'os',
                'node:path',
                'path',
              ],
              message:
                'src/packages/core 必须保持平台无关：IO 与路径能力由调用方注入，禁止直接引用 Node 专属模块。',
            },
          ],
        },
      ],
    },
  },
);