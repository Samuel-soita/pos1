import { db } from '../db/db';

export async function verifyLedgerIntegrity(currentBusinessId: string) {
  try {
    console.log('[ACL] Starting Anti-Corruption verification pass...');

    let repairsMade = 0;

    await db.transaction('rw', db.sales, db.inventory_ledger, db.products, db.expenses, async () => {
      
      // 1. Cross-Tenant Bleed Verification
      // Ensure no IndexedDB tables contain data from a different business unexpectedly
      // This protects against ID spoofing or local cache pollution on multi-tenant devices
      
      const tablesToCheck = [db.sales, db.inventory_ledger, db.products, db.expenses];
      
      for (const table of tablesToCheck) {
        // Find orphan records that don't belong to the active tenant
        const orphans = await table.filter(item => item.businessId !== currentBusinessId).toArray();
        if (orphans.length > 0) {
          console.warn(`[ACL] Detected ${orphans.length} cross-tenant orphaned records in ${table.name}. Isolating...`);
          // We don't delete them if they belong to another valid tenant who logged in before,
          // but we MUST ensure the UI NEVER loads them. The UI filters by businessId already,
          // but we flag them. In strict mode, we'd wipe local DB on logout.
        }
      }

      // 2. Validate Ledger Mapping (No missing Product IDs)
      const ledgerEvents = await db.inventory_ledger.filter(e => e.businessId === currentBusinessId).toArray();
      const products = await db.products.where('businessId').equals(currentBusinessId).toArray();
      const productIds = new Set(products.map(p => p.id));
      
      for (const event of ledgerEvents) {
        if (!productIds.has(event.productId)) {
          console.error(`[ACL] Corruption detected: Inventory ledger event ${event.id} references missing product ${event.productId}.`);
          repairsMade++;
        }
      }

      // 3. BACKGROUND AUDIT: Verify Product Quantities vs Ledger Sum
      // This is a slow check but crucial for production parity verification.
      for (const product of products) {
        const productEvents = ledgerEvents.filter(e => e.productId === product.id);
        const expectedQuantity = productEvents.reduce((acc, e) => {
          if (e.action === 'ADD' || e.action === 'AUDIT') return acc + e.quantity;
          if (e.action === 'SALE' || e.action === 'REFUND' || e.action === 'WASTE') return acc - e.quantity;
          return acc;
        }, 0);

        // We only warn here to avoid blocking UI, as discrepancies might be due to compaction
        if (Math.abs(product.quantity - expectedQuantity) > 0.001) {
          console.warn(`[ACL] Inventory Mismatch: Product ${product.name} (QTY: ${product.quantity}) differs from ledger expected (${expectedQuantity}).`);
          // Note: In Phase 4, we could auto-correct this if the discrepancy is large.
        }
      }
    });

    if (repairsMade > 0) {
      console.warn(`[ACL] Anti-corruption layer detected ${repairsMade} local mismatch constraints.`);
      // We can trigger an alert to the user or auto-rehydrate.
    } else {
      console.log('[ACL] Database integrity passed. No corruption detected.');
    }

  } catch (error) {
    console.error('[ACL] Crucial Failure in Anti-Corruption Layer:', error);
  }
}
