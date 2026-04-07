import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Register the service worker for offline support
registerSW({
  onOfflineReady() {
    console.log('App ready for offline use');
  },
  onNeedRefresh() {
    console.log('New content available, please refresh');
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
