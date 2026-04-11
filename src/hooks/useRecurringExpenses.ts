import { useEffect } from 'react';
import { db } from '../db/db';
import { v4 as uuidv4 } from 'uuid';

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

          // Add to sync queue for both
          await db.sync_queue.bulkAdd([
            {
              id: uuidv4(),
              action: 'INSERT',
              table: 'expenses',
              payload: newExpense,
              timestamp: now,
              status: 'pending',
              errorCount: 0
            },
            {
              id: uuidv4(),
              action: 'UPDATE',
              table: 'recurring_expenses',
              payload: { ...item, nextRun },
              timestamp: now,
              status: 'pending',
              errorCount: 0
            }
          ]);

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
