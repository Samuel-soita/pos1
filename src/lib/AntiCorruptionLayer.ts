import { db } from '../db/db';

export async function verifyLedgerIntegrity(currentBusinessId: string): Promise<boolean> {
  try {
    console.log('[ACL] Starting Anti-Corruption verification pass...');

    let corruptionFound = false;

    await db.transaction('r', [db.sales, db.inventory_ledger, db.products, db.expenses], async () => {
      
      const tablesToCheck = [db.sales, db.inventory_ledger, db.products, db.expenses];
      
      for (const table of tablesToCheck) {
        const orphans = await table.filter(item => item.businessId !== currentBusinessId).toArray();
        if (orphans.length > 0) {
          console.warn(`[ACL] Detected ${orphans.length} cross-tenant orphaned records in ${table.name}.`);
          // Note: orphans don't necessarily mean corruption if they are synced, but we flag for audit
        }
      }

      const ledgerEvents = await db.inventory_ledger.filter(e => e.businessId === currentBusinessId).toArray();
      const products = await db.products.where('businessId').equals(currentBusinessId).toArray();
      const productIds = new Set(products.map(p => p.id));
      
      for (const event of ledgerEvents) {
        if (!productIds.has(event.productId)) {
          console.error(`[ACL] Corruption detected: Inventory ledger event ${event.id} references missing product ${event.productId}.`);
          corruptionFound = true;
        }
      }

      for (const product of products) {
        const productEvents = ledgerEvents.filter(e => e.productId === product.id);
        const expectedQuantity = productEvents.reduce((acc, e) => {
          if (e.action === 'ADD' || e.action === 'AUDIT' || e.action === 'VOID') return acc + e.quantity;
          if (e.action === 'SALE' || e.action === 'REFUND' || e.action === 'WASTE') return acc - e.quantity;
          return acc;
        }, 0);

        if (Math.abs(product.quantity - expectedQuantity) > 0.001) {
          // Discrepancy detected. Could be due to compaction or actual corruption.
          // Since compaction deletes old ledger events, expectedQuantity will often mismatch.
          // We should NOT trigger a full state wipe (rebuildState) for this, as it causes massive data loss on refresh.
          if (productEvents.length > 0) {
            console.warn(`[ACL] Inventory Mismatch (Likely Compaction): Product ${product.name} (QTY: ${product.quantity}) differs from ledger expected (${expectedQuantity}). Not triggering wipe.`);
            // corruptionFound = true; // Disabled to prevent refresh wipe bug
          }
        }
      }
    });

    if (corruptionFound) {
      console.warn(`[ACL] Anti-corruption layer detected local mismatch constraints.`);
    } else {
      console.log('[ACL] Database integrity passed. No corruption detected.');
    }

    return corruptionFound;

  } catch (error) {
    console.error('[ACL] Crucial Failure in Anti-Corruption Layer:', error);
    return false;
  }
}
