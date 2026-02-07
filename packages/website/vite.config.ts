import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    // Only add Sentry plugin in production builds when auth token is available
    process.env.SENTRY_AUTH_TOKEN &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG || 'YOUR_SENTRY_ORG',
        project: process.env.SENTRY_PROJECT || 'recrate-website',
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    sourcemap: true, // Required for Sentry source maps
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cleanse: resolve(__dirname, 'cleanse.html'),
      },
    },
  },
})
