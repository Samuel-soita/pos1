import { useCallback } from 'react';
import { db } from '../db/db';

const COMPACTION_THRESHOLD_DAYS = 90;
const DLQ_EXPIRATION_DAYS = 180;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Allow for dynamic timeField access while keeping main props typed
}

export function useCompaction() {
  
  const compactTable = async (
    tableName: 'sales' | 'inventory_ledger' | 'cash_logs' | 'shifts',
    timeField: string,
    thresholdTime: number,
    protectedIds: Set<string>,
    parentTraceProtectedIds: Set<string>,
    dryRun: boolean
  ): Promise<CompactionResult> => {
    const res: CompactionResult = { deleted: 0, skipped: 0, errors: 0, anomalies: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = db[tableName] as any;

    try {
      // 1. Find candidates using indexed query on syncStatus
      // This is high-performance: only looking at already confirmed synced records
      const candidates = await table
        .where('syncStatus')
        .equals('synced')
        .and((item: CompactionItem) => (item[timeField] as number) < thresholdTime)
        .toArray() as CompactionItem[];

      if (candidates.length === 0) return res;

      // 2. Minimum History Protection
      // Ensure we keep at least MIN_HISTORY_RECORDS OR last (THRESHOLD) days, whichever is larger.
      const totalCount = await table.count();
      let deleteLimit = candidates.length;
      
      if (totalCount - candidates.length < MIN_HISTORY_RECORDS) {
        deleteLimit = Math.max(0, totalCount - MIN_HISTORY_RECORDS);
      }

      // 3. Chain & Protection Filter
      // Sort oldest first to delete in chronological order
      const toDelete = candidates
        .sort((a, b) => (a[timeField] as number) - (b[timeField] as number))
        .slice(0, deleteLimit)
        .filter((item) => {
          // Rule: Skip if in sync_queue or DLQ
          if (protectedIds.has(item.id)) {
            res.skipped++;
            return false;
          }

          // Rule: Referential Integrity (Ledger -> Sale)
          // If this is a ledger event, don't delete if its parent trace is still protected
          if (tableName === 'inventory_ledger' && item.traceId && parentTraceProtectedIds.has(item.traceId)) {
            res.skipped++;
            res.anomalies.push(`Ledger ${item.id} skipped - Parent ${item.traceId} still protected.`);
            return false;
          }

          return true;
        });

      if (toDelete.length === 0) return res;

      // 4. Dry Run Logging
      if (dryRun) {
        console.log(`[Compaction Dry-Run] Table: ${tableName}. Would delete ${toDelete.length} records.`);
        res.deleted = toDelete.length;
        return res;
      }

      // 5. Chunked Execution in a Transaction
      // Rollback protection is handled by Dexie transactions per batch
      for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
        const chunk = toDelete.slice(i, i + CHUNK_SIZE).map((item) => item.id);
        
        await db.transaction('rw', table, async () => {
          await table.bulkDelete(chunk);
          res.deleted += chunk.length;
        });

        // Yield to main thread to prevent UI freezing on low-end devices
        if (i + CHUNK_SIZE < toDelete.length) {
          await new Promise(r => setTimeout(r, 10));
        }
      }

    } catch (err) {
      console.error(`[Compaction] Error processing ${tableName}:`, err);
      res.errors++;
    }

    return res;
  };

  const compactOldData = useCallback(async (dryRun = false) => {
    try {
      const startTime = Date.now();
      const thresholdTime = startTime - (COMPACTION_THRESHOLD_DAYS * MS_PER_DAY);
      const dlqThreshold = startTime - (DLQ_EXPIRATION_DAYS * MS_PER_DAY);

      console.log(`[Storage Compaction] Starting pass (Threshold: ${new Date(thresholdTime).toLocaleDateString()}) ${dryRun ? '[DRY RUN]' : ''}`);

      // 1. Gather Global Protections
      const syncItems = await db.sync_queue.toArray();
      const dlqItems = await db.dlq.toArray();
      
      const protectedIds = new Set([
        ...syncItems.map(i => i.id),
        ...dlqItems.map(i => i.id)
      ]);

      // Protect ledger events whose parent sales are not yet synced
      const parentTraceProtectedIds = new Set([
        ...syncItems.filter(i => i.table === 'sales').map(i => i.payload?.id),
        ...dlqItems.filter(i => i.tableName === 'sales').map(i => i.payload?.id)
      ]);

      // 2. DLQ Expiration (Cleanup stagnant errors to prevent blocking compaction)
      if (!dryRun) {
        const expiredDlqCount = await db.dlq.where('failedAt').below(dlqThreshold).delete();
        if (expiredDlqCount > 0) {
          console.log(`[Compaction] Expired ${expiredDlqCount} stagnant DLQ records.`);
        }
      }

      // 3. Process Tables
      const results = {
        sales: await compactTable('sales', 'timestamp', thresholdTime, protectedIds, parentTraceProtectedIds, dryRun),
        ledger: await compactTable('inventory_ledger', 'recordedAt', thresholdTime, protectedIds, parentTraceProtectedIds, dryRun),
        cash: await compactTable('cash_logs', 'timestamp', thresholdTime, protectedIds, parentTraceProtectedIds, dryRun),
        shifts: await compactTable('shifts', 'startTime', thresholdTime, protectedIds, parentTraceProtectedIds, dryRun),
      };

      // 4. Final Logging
      console.log(`[Storage Compaction] COMPLETED in ${Date.now() - startTime}ms.`);
      console.table({
        Sales: { Deleted: results.sales.deleted, Skipped: results.sales.skipped, Anomalies: results.sales.anomalies.length },
        Ledger: { Deleted: results.ledger.deleted, Skipped: results.ledger.skipped, Anomalies: results.ledger.anomalies.length },
        CashLogs: { Deleted: results.cash.deleted, Skipped: results.cash.skipped, Anomalies: results.cash.anomalies.length },
        Shifts: { Deleted: results.shifts.deleted, Skipped: results.shifts.skipped, Anomalies: results.shifts.anomalies.length },
      });

      if (!dryRun) {
        await db.settings.put({ key: 'last_compaction', value: Date.now() });
      }

    } catch (error) {
      console.error('[Storage Compaction] Fatal Error:', error);
    }
  }, []);

  return {
    compactOldData
  };
}
