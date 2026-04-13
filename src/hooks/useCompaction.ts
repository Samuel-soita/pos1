import { useCallback } from 'react';
import { db } from '../db/db';

const COMPACTION_THRESHOLD_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CHUNK_SIZE = 25;
const MIN_HISTORY_RECORDS = 500;

interface CompactionResult {
  deleted: number;
  skipped: number;
  errors: number;
  anomalies: string[];
}

interface CompactionItem {
  id: string;
  syncStatus?: string;
  traceId?: string;
  [key: string]: unknown; 
}

export function useCompaction() {
  
  const compactTable = async (
    tableName: 'sales' | 'cash_logs' | 'shifts',
    timeField: string,
    thresholdTime: number,
    protectedIds: Set<string>,
    dryRun: boolean
  ): Promise<CompactionResult> => {
    const res: CompactionResult = { deleted: 0, skipped: 0, errors: 0, anomalies: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = db[tableName] as any;

    try {
      const candidates = await table
        .where('syncStatus')
        .equals('synced')
        .and((item: CompactionItem) => (item[timeField] as number) < thresholdTime)
        .toArray() as CompactionItem[];

      if (candidates.length === 0) return res;

      const totalCount = await table.count();
      let deleteLimit = candidates.length;
      
      if (totalCount - candidates.length < MIN_HISTORY_RECORDS) {
        deleteLimit = Math.max(0, totalCount - MIN_HISTORY_RECORDS);
      }

      const toDelete = candidates
        .sort((a, b) => (a[timeField] as number) - (b[timeField] as number))
        .slice(0, deleteLimit)
        .filter((item) => {
          if (protectedIds.has(item.id)) {
            res.skipped++;
            return false;
          }
          return true;
        });

      if (toDelete.length === 0) return res;

      if (dryRun) {
        res.deleted = toDelete.length;
        return res;
      }

      for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
        const chunk = toDelete.slice(i, i + CHUNK_SIZE).map((item) => item.id);
        
        await db.transaction('rw', table, async () => {
          await table.bulkDelete(chunk);
          res.deleted += chunk.length;
        });

        if (i + CHUNK_SIZE < toDelete.length) {
          await new Promise(r => setTimeout(r, 10));
        }
      }

    } catch {
      res.errors++;
    }

    return res;
  };

  const compactOldData = useCallback(async (dryRun = false) => {
    try {
      const startTime = Date.now();
      const thresholdTime = startTime - (COMPACTION_THRESHOLD_DAYS * MS_PER_DAY);

      // 1. Gather Global Protections from the new POSEvent ledger
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pendingEvents = await (db as any).pos_events.where('sync_status').anyOf(['pending', 'failed', 'rejected_dlq']).toArray();
      
      const protectedIds = new Set([
        ...pendingEvents.map((e: { payload?: { id?: string } }) => e.payload?.id).filter(Boolean) as string[]
      ]);

      // 2. Process Tables
      await compactTable('sales', 'timestamp', thresholdTime, protectedIds, dryRun);
      await compactTable('cash_logs', 'timestamp', thresholdTime, protectedIds, dryRun);
      await compactTable('shifts', 'startTime', thresholdTime, protectedIds, dryRun);

      if (!dryRun) {
        await db.settings.put({ key: 'last_compaction', value: Date.now() });
      }

    } catch {
      // Silently fail and let loop retry
    }
  }, []);

  return {
    compactOldData
  };
}
