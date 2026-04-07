import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['POS1.png'],
      manifest: {
        name: 'Credentilas POS',
        short_name: 'Credentilas',
        description: 'Offline-First POS by Samuel Soita',
        theme_color: '#2563eb',
        icons: [
          {
            src: 'POS1.png',
            sizes: '192x192 512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ],
})
