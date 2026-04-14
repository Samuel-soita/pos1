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
      case 'stock_committed': {
        const { productId, delta } = event.payload;
        newState[productId] = (newState[productId] || 0) + delta;
        break;
      }

      case 'stock_restored':
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
       if (viewType === 'stock' && !event.event_type.startsWith('stock_') && !['PRODUCT_CREATED', 'INVENTORY_RESTOCKED', 'INVENTORY_AUDITED'].includes(event.event_type)) continue;
       if (viewType === 'sales' && event.event_type !== 'sale_created') continue;
       if (viewType === 'cash' && event.event_type !== 'payment_received') continue;

       snapshot = POSReducer.applyEvent(snapshot, event);
    }

    // 3. Persist the Materialized View back to Dexie
    await db.snapshots.put(snapshot);
    return snapshot;
  }
}
