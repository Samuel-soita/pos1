import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { runMigrations } from './db/migrations'

// Register the service worker for offline support
registerSW({
  onOfflineReady() {
    console.log('App ready for offline use');
  },
  onNeedRefresh() {
    console.log('New content available, please refresh');
  },
})

// Database Maintenance Path
const init = async () => {
  // Enforce schema integrity for multi-tenant isolation
  await runMigrations();
};
init();

import { ErrorBoundary } from './components/ErrorBoundary'
import { SyncProvider } from './context/SyncContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SyncProvider>
        <App />
      </SyncProvider>
    </ErrorBoundary>
  </StrictMode>,
)
