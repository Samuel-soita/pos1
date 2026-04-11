import { db } from '../db/db';
import type { POSEvent, MaterializedSnapshot } from '../db/db';

export class POSReducer {
  
  /**
   * Applies a single event to the deterministic Snapshot state
   */
  static applyEvent(snapshot: MaterializedSnapshot, event: POSEvent): MaterializedSnapshot {
    const newState = { ...snapshot.state };

    switch (event.event_type) {
      case 'stock_reserved':
      case 'stock_committed':
        // Payload: { productId, delta }
        const { productId, delta } = event.payload;
        if (!newState[productId]) {
          newState[productId] = 0; // Or initialize with full product obj
        }
        newState[productId] += delta;
        break;
      
      case 'sale_created':
        // Payload: { id, total, items... }
        newState.total_revenue = (newState.total_revenue || 0) + event.payload.total;
        newState.sale_count = (newState.sale_count || 0) + 1;
        break;
      
      case 'stock_rejected':
        // Reversal of an optimistic projection
        const { productId: rejId, delta: rejDelta } = event.payload;
        if (newState[rejId] !== undefined) {
          // Reverting the reserved drop (which was a negative delta)
          newState[rejId] -= rejDelta;
        }
        break;
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
    
    // 1. Initialize Blank State
    let snapshot: MaterializedSnapshot = {
      id: snapshotId,
      business_id: businessId,
      view_type: viewType,
      state: {}, // Default empty state
      last_applied_event: 'INIT',
      updated_at: Date.now()
    };

    // If it's stock, we might want to scaffold the state with raw products first
    if (viewType === 'stock') {
      const allProducts = await db.products.where({ businessId }).toArray();
      allProducts.forEach(p => {
        snapshot.state[p.id] = p.quantity || 0;
      });
    }

    // 2. Stream and Reduce all verified events in chronological order
    const events = await db.pos_events
      .where('business_id').equals(businessId)
      // .orderBy('server_timestamp') // Note: Dexie compound ordering might require specific indexes
      .toArray();

    // Mathematically sort locally to ensure strict determinism
    events.sort((a, b) => a.server_timestamp - b.server_timestamp);

    for (const event of events) {
       // Filter events relevant to this view
       if (viewType === 'stock' && !event.event_type.startsWith('stock_')) continue;
       if (viewType === 'sales' && event.event_type !== 'sale_created') continue;
       if (viewType === 'cash' && event.event_type !== 'payment_received') continue;

       snapshot = POSReducer.applyEvent(snapshot, event);
    }

    // 3. Persist the Materialized View back to Dexie
    await db.snapshots.put(snapshot);
    return snapshot;
  }
}
