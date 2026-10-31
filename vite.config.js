import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server injects inline scripts for hot reloading, which the page's Content Security Policy blocks.
// Production builds keep the policy: they only load files from the site itself.
const devWithoutCsp = {
  name: 'dev-without-csp',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, ''),
};

export default defineConfig({
  root: 'site',
  // Relative asset paths, so the build works from any folder (GitHub Pages serves it under /<repo>/).
  base: './',
  plugins: [react(), devWithoutCsp],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});
