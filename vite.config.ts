import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [
    sveltekit({
      adapter: adapter({ out: 'dist', precompress: false }),
      paths: { origin: process.env.APP_ORIGIN || undefined },
      preprocess: vitePreprocess(),
    }),
  ],
});
