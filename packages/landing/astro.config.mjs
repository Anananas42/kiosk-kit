import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://kioskk.net',
  integrations: [react()],
  server: { port: 4321 },
});
