/// <reference types="vitest/config" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: [
        'assets/FSPH_PIN.png',
        'assets/apple-touch-icon.png',
        'assets/icon.png',
        'assets/pwa-badge-72x72.png',
      ],
      manifest: {
        name: 'Gestão da Frota - FSPH',
        short_name: 'Frota FSPH',
        description: 'Sistema de Gestão de Frota e Transportes da Fundação Parreira Horta',
        theme_color: '#1554b8',
        background_color: '#f4f6f8',
        display: 'standalone',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/assets/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/assets/pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
