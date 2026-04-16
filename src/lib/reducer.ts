import { db } from '../db/db';
import type { POSEvent, MaterializedSnapshot } from '../db/db';

export class POSReducer {
  
  /**
   * Applies a single event to the deterministic Snapshot state
   */
  static applyEvent(snapshot: MaterializedSnapshot, event: POSEvent): MaterializedSnapshot {
    const newState = { ...snapshot.state };

    switch (event.event_type) {
      case 'PRODUCT_CREATED':
        // Payload: { id, quantity, ... }
        newState[event.payload.id] = event.payload.quantity || 0;
        break;

      case 'stock_reserved':
      case 'STOCK_RESERVED':
      case 'stock_committed':
      case 'STOCK_COMMITTED': {
        const { productId, delta } = event.payload;
        newState[productId] = (newState[productId] || 0) + delta;
        break;
      }

      case 'stock_restored':
      case 'STOCK_RESTORED':
      case 'INVENTORY_RESTOCKED': {
        const { productId, delta } = event.payload;
        newState[productId] = (newState[productId] || 0) + (delta || 0);
        break;
      }

      case 'INVENTORY_AUDITED': {
        const { productId, physicalCount } = event.payload;
        newState[productId] = physicalCount;
        break;
      }
      
      case 'sale_created':
      case 'SALE_CREATED':
        newState.total_revenue = Math.round(((newState.total_revenue || 0) + event.payload.total) * 100) / 100;
        newState.sale_count = (newState.sale_count || 0) + 1;
        break;

      case 'EXPENSE_CREATED':
        newState.total_expenses = Math.round(((newState.total_expenses || 0) + (event.payload.amount || 0)) * 100) / 100;
        newState.expense_count = (newState.expense_count || 0) + 1;
        break;
      
      case 'stock_rejected': {
        const { productId: rejId, delta: rejDelta } = event.payload;
        if (newState[rejId] !== undefined) {
          newState[rejId] -= rejDelta;
        }
        break;
      }

      case 'PURCHASE_CREATED': {
        const { items } = event.payload;
        if (Array.isArray(items)) {
          items.forEach((item: { productId?: string; product_id?: string; quantity?: number }) => {
            const pid = item.productId || item.product_id;
            if (pid) {
              newState[pid] = (newState[pid] || 0) + (item.quantity || 0);
            }
          });
        }
        break;
      }
    }

    return {
      ...snapshot,
      state: newState,
      last_applied_event: event.event_id,
      updated_at: Date.now()
    };
  }

  /**
   * Rebuilds a snapshot completely from scratch by streaming the POS Events log.
   */
  static async rebuildSnapshot(businessId: string, viewType: 'stock' | 'sales' | 'cash') {
    const snapshotId = `${viewType}_${businessId}`;
    
    // 1. Initialize Blank State (Source of Truth is the Event Log)
    let snapshot: MaterializedSnapshot = {
      id: snapshotId,
      business_id: businessId,
      view_type: viewType,
      state: {}, 
      last_applied_event: 'INIT',
      updated_at: Date.now()
    };

    // 2. Stream and Reduce all verified events in chronological order
    const events = await db.pos_events
      .where('business_id').equals(businessId)
      // .orderBy('server_timestamp') // Note: Dexie compound ordering might require specific indexes
      .toArray();

    // Mathematically sort locally to ensure strict determinism
    events.sort((a, b) => a.server_timestamp - b.server_timestamp);

    for (const event of events) {
       // Filter events relevant to this view
        if (viewType === 'stock' && !['stock_reserved', 'STOCK_RESERVED', 'stock_committed', 'STOCK_COMMITTED', 'stock_restored', 'STOCK_RESTORED', 'PRODUCT_CREATED', 'INVENTORY_RESTOCKED', 'INVENTORY_AUDITED', 'PURCHASE_CREATED'].includes(event.event_type)) continue;
       if (viewType === 'sales' && !['sale_created', 'SALE_CREATED'].includes(event.event_type)) continue;
       if (viewType === 'cash' && !['payment_received', 'PAYMENT_RECEIVED'].includes(event.event_type)) continue;

       snapshot = POSReducer.applyEvent(snapshot, event);
    }

    // 3. Persist the Materialized View back to Dexie
    await db.snapshots.put(snapshot);
    return snapshot;
  }
}
