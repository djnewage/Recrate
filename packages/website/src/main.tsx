import React from 'react'
import ReactDOM from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { initSentry } from './utils/sentry'
import { initMetaPixel } from './utils/metaPixel'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App'
import './index.css'

// Initialize Sentry and Meta Pixel before rendering
initSentry()
initMetaPixel()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <Analytics />
    </ErrorBoundary>
  </React.StrictMode>,
)
