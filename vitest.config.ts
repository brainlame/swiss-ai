import { defineConfig, mergeConfig } from 'vitest/config';
import appConfig from './vite.config.ts';
export default mergeConfig(
  appConfig,
  defineConfig({ test: { include: ['tests/unit/**/*.test.ts'] } }),
);
