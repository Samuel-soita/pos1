import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { db } from './db/db'
import { seedDatabase } from './db/seed'

// Register the service worker for offline support
registerSW({
  onOfflineReady() {
    console.log('App ready for offline use');
  },
  onNeedRefresh() {
    console.log('New content available, please refresh');
  },
})

// Auto-seed in development if empty
const init = async () => {
  const bizCount = await db.businesses.count();
  if (bizCount === 0) {
    console.log('Empty database detected. Seeding initial data...');
    await seedDatabase();
  }
};
init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
