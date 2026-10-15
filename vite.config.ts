import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import node from '@sveltejs/adapter-node';
import vercel from '@sveltejs/adapter-vercel';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [
    sveltekit({
      adapter:
        process.env.VERCEL === '1'
          ? vercel({ runtime: 'nodejs24.x' })
          : node({ out: 'dist', precompress: false }),
      paths: { origin: process.env.APP_ORIGIN || undefined },
      preprocess: vitePreprocess(),
    }),
  ],
});
