import { defineConfig, mergeConfig } from 'vitest/config';
import appConfig from './vite.config.ts';
export default mergeConfig(
  appConfig,
  defineConfig({
    test: {
      include: ['tests/integration/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 60000,
      fileParallelism: false,
    },
  }),
);
