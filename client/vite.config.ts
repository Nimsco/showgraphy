import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function siteFiles(siteUrl: string): Plugin {
  return {
    name: 'showgraphy-site-files',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /app/\nSitemap: ${siteUrl}/sitemap.xml\n` });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl}/</loc></url><url><loc>${siteUrl}/login</loc></url><url><loc>${siteUrl}/register</loc></url></urlset>\n` });
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_');
  const siteUrl = (environment.VITE_SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
  return {
    plugins: [react(), tailwindcss(), siteFiles(siteUrl)],
    server: { host: '0.0.0.0', port: 5173, strictPort: true },
    test: { environment: 'jsdom', setupFiles: './src/testSetup.ts' },
  };
});
