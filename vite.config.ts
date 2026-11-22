import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The app is served from https://<user>.github.io/finance-tracker/
export default defineConfig({
  base: '/finance-tracker/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Finance Tracker',
        short_name: 'Finance',
        description: 'Personal finance, budgets and debt-free planner',
        theme_color: '#0f766e',
        background_color: '#f7f7f5',
        display: 'standalone',
        start_url: '/finance-tracker/',
        scope: '/finance-tracker/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  test: { environment: 'node', setupFiles: ['fake-indexeddb/auto'] }
})
