import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  outDir: '../../../dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: ['@manage-skills/core'],
  alias: {
    '@manage-skills/core': '../../packages/core/src/index.ts',
  },
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});