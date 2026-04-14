import { useEffect } from 'react';
import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';
import { generateEventHash } from '../utils/hashUtils';

export function useRecurringExpenses() {
  useEffect(() => {
    const processRecurring = async () => {
      const now = Date.now();
      const items = await db.recurring_expenses.where('isActive').equals(1).toArray();

      for (const item of items) {
        if (now >= item.nextRun) {
          // Log the actual expense
          const newExpense = {
            id: uuidv4(),
            businessId: item.businessId,
            title: item.title,
            amount: item.amount,
            category: item.category,
            description: `Auto-generated from recurring template: ${item.title}`,
            status: 'verified' as const,
            timestamp: now,
            branchId: item.branchId
          };

          await db.expenses.add(newExpense);
          
          // Calculate next run
          let nextRun = item.nextRun;
          const dayMs = 24 * 60 * 60 * 1000;
          
          if (item.frequency === 'daily') nextRun += dayMs;
          else if (item.frequency === 'weekly') nextRun += 7 * dayMs;
          else if (item.frequency === 'monthly') {
            const date = new Date(item.nextRun);
            date.setMonth(date.getMonth() + 1);
            nextRun = date.getTime();
          }

          // Update the template
          await db.recurring_expenses.update(item.id, { nextRun });

          // Emit events for both
          const expenseHash = await generateEventHash(newExpense);
          await db.pos_events.add({
            event_id: uuidv4(),
            business_id: item.businessId,
            staff_id: 'system',
            event_type: 'EXPENSE_CREATED',
            payload: newExpense,
            client_timestamp: now,
            server_timestamp: 0,
            hash: expenseHash,
            sync_status: 'pending'
          });

          const templatePayload = { ...item, nextRun };
          const templateHash = await generateEventHash(templatePayload);
          await db.pos_events.add({
            event_id: uuidv4(),
            business_id: item.businessId,
            staff_id: 'system',
            event_type: 'RECURRING_EXPENSE_UPDATED',
            payload: templatePayload,
            client_timestamp: now,
            server_timestamp: 0,
            hash: templateHash,
            sync_status: 'pending'
          });

          console.log(`Processed recurring expense: ${item.title}`);
        }
      }
    };

    // Run on mount and then every hour while app is open
    processRecurring();
    const interval = setInterval(processRecurring, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
}
