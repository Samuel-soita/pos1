import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useSync as useSyncContext } from '../context/SyncContext';

/**
 * useSync hook
 * Now a lightweight wrapper around SyncContext to maintain backward compatibility
 * while centralizing the sync engine.
 */
export function useSync() {
  return useSyncContext();
}

/**
 * useSyncStatus hook
 * Provides high-level sync health and status indicators for the UI.
 */
export function useSyncStatus() {
  const pendingCount = useLiveQuery(() => db.pos_events.where('sync_status').equals('pending').count()) || 0;
  const { isOnline, isSyncing, syncHealth, activeTerminals } = useSyncContext();
  
  return { 
    pendingCount, 
    isOnline, 
    isSyncing, 
    syncHealth,
    activeTerminals
  };
}
