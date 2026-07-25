import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/, other hosts from the root.
// BASE_PATH is set by the deploy workflow; local dev and preview stay at '/'.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'FilmTable',
        short_name: 'FilmTable',
        description: 'Track TV shows and movies. A local-first TV Time replacement.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f2f2f2',
        theme_color: '#f2f2f2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.tvmaze\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'tvmaze-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(static\.tvmaze\.com|.*\.mzstatic\.com|m\.media-amazon\.com|images\.metahub\.space)\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'poster-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/(itunes\.apple\.com|v3-cinemeta\.strem\.io)\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'movie-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { host: true },
  preview: { host: true },
})
