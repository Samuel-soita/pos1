import { useState, useCallback } from 'react';
import { db, type RecurringExpense } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, TrendingDown, Clock, Repeat } from 'lucide-react';
import { generateTraceableId, getDeviceId } from '../utils/idUtils';
import { generateEventHash } from '../utils/hashUtils';
import { playBeep } from '../utils/audio';
import { useAuth } from '../hooks/useAuth';
import { useShifts } from '../hooks/useShifts';
import { useLayout } from '../context/LayoutContext';

// Granular Sub-components (Phase 2 SOLID)
import { ExpenseTable } from './expenses/ExpenseTable';
import { QuickLog } from './expenses/QuickLog';
import { RecurringExpenses } from './expenses/RecurringExpenses';
import { AddExpenseModal } from './expenses/AddExpenseModal';
import { StatsCard } from './shared/StatsCard';

export function Expenses({ initialView }: { initialView?: string }) {
  const { businessId, business } = useAuth();
  const { requestAuth } = useLayout();
  const { recordExpenseToShift } = useShifts();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(initialView === 'recurring');
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('all');
  
  const securityModeSetting = useLiveQuery(() => db.settings.get('security_mode'));
  const isOwner = securityModeSetting?.value !== 'staff';

  const expenses = useLiveQuery(
    () => {
      const query = db.expenses.orderBy('timestamp').reverse();
      if (filter !== 'all') {
        return db.expenses.where('status').equals(filter).reverse().sortBy('timestamp');
      }
      return query.toArray();
    }, [filter]
  ) || [];

  const recurring = useLiveQuery(() => db.recurring_expenses.toArray()) || [];

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = useLiveQuery(() => db.expenses.where('status').equals('pending').count()) || 0;

  const onAddExpense = async (formData: { title: string; amount: number; category: string; receiptImage: string | null }) => {
    requestAuth(async () => {
      const now = Date.now();
      const deviceId = await getDeviceId();
      await db.transaction('rw', [db.expenses, db.pos_events, db.counters, db.settings, db.shifts], async () => {
        await recordExpenseToShift(formData.amount);
        const id = await generateTraceableId('EXP', businessId!, business!.code, deviceId);
        const newExpense = {
          ...formData,
          receiptImage: formData.receiptImage || undefined,
          id,
          businessId: businessId!,
          description: '',
          timestamp: now,
          status: (isOwner ? 'verified' : 'pending') as 'verified' | 'pending',
          syncStatus: 'pending' as const
        };
        await db.expenses.add(newExpense);
        const eventHash = await generateEventHash(newExpense);
        await db.pos_events.add({
          event_id: await generateTraceableId('EVT', businessId!, business!.code, deviceId),
          business_id: businessId!,
          staff_id: 'owner',
          event_type: 'EXPENSE_CREATED',
          payload: newExpense,
          client_timestamp: now,
          server_timestamp: 0,
          hash: eventHash,
          sync_status: 'pending'
        });
        playBeep();
      });
    });
  };

  const onVerify = useCallback(async (id: string, status: 'verified' | 'rejected') => {
    requestAuth(async () => {
      const now = Date.now();
      await db.transaction('rw', [db.expenses, db.pos_events, db.counters, db.settings], async () => {
        await db.expenses.update(id, { status, verifiedAt: now, verifiedBy: 'owner' });
        const updated = await db.expenses.get(id);
        const deviceId = await getDeviceId();
        const eventHash = await generateEventHash(updated);
        await db.pos_events.add({
          event_id: await generateTraceableId('EVT', businessId!, business!.code, deviceId),
          business_id: businessId!,
          staff_id: 'owner',
          event_type: 'EXPENSE_UPDATED',
          payload: updated,
          client_timestamp: now,
          server_timestamp: 0,
          hash: eventHash,
          sync_status: 'pending'
        });
        playBeep();
      });
    });
  }, [businessId, business, requestAuth]);

  const onDelete = useCallback(async (id: string) => {
    requestAuth(async () => {
      if (confirm('Are you sure you want to delete this expense?')) {
        const now = Date.now();
        const deviceId = await getDeviceId();
        await db.transaction('rw', [db.expenses, db.pos_events, db.counters, db.settings], async () => {
          await db.expenses.delete(id);
          const payload = { id };
          const eventHash = await generateEventHash(payload);
          await db.pos_events.add({
            event_id: await generateTraceableId('EVT', businessId!, business!.code, deviceId),
            business_id: businessId!,
            staff_id: 'owner',
            event_type: 'EXPENSE_DELETED',
            payload,
            client_timestamp: now,
            server_timestamp: 0,
            hash: eventHash,
            sync_status: 'pending'
          });
          playBeep();
        });
      }
    });
  }, [businessId, business, requestAuth]);

  const onAddRecurring = async (formData: { title: string; amount: string; category: string; frequency: 'daily' | 'weekly' | 'monthly' }) => {
    const now = Date.now();
    const deviceId = await getDeviceId();
    const id = await generateTraceableId('EXP', businessId!, business!.code, deviceId);
    const newRec = { 
      ...formData, 
      id, 
      businessId: businessId!, 
      amount: parseFloat(formData.amount),
      nextRun: now, 
      isActive: true, 
      syncStatus: 'pending' as const 
    };
    await db.recurring_expenses.add(newRec);
    const eventHash = await generateEventHash(newRec);
    await db.pos_events.add({
      event_id: await generateTraceableId('EVT', businessId!, business?.code, deviceId),
      business_id: businessId!,
      staff_id: 'owner',
      event_type: 'RECURRING_EXPENSE_CREATED',
      payload: newRec,
      client_timestamp: now,
      server_timestamp: 0,
      hash: eventHash,
      sync_status: 'pending'
    });
    playBeep();
  };

  const onToggleRecurring = async (item: RecurringExpense) => {
    const newStatus = !item.isActive;
    const now = Date.now();
    const deviceId = await getDeviceId();
    await db.recurring_expenses.update(item.id, { isActive: newStatus });
    const payload = { ...item, isActive: newStatus };
    const eventHash = await generateEventHash(payload);
    await db.pos_events.add({
      event_id: await generateTraceableId('EVT', businessId!, business?.code, deviceId),
      business_id: businessId!,
      staff_id: 'owner',
      event_type: 'RECURRING_EXPENSE_UPDATED',
      payload,
      client_timestamp: now,
      server_timestamp: 0,
      hash: eventHash,
      sync_status: 'pending'
    });
    playBeep();
  };

  if (!isOwner) {
    return <QuickLog onSubmit={onAddExpense} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>Expenses</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-secondary" onClick={() => setShowRecurringModal(true)}>
            <Repeat size={20} /> <span className="desktop-only">Recurring Bills</span>
          </button>
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={20} /> Log Expense
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <StatsCard 
          title="Total Expenses (All Time)" 
          value={`KES ${totalExpenses.toLocaleString()}`} 
          icon={TrendingDown} 
          iconBg="#fee2e2" 
          iconColor="var(--danger)" 
        />
        <StatsCard 
          title="Pending Verification" 
          value={`${pendingCount} Items`} 
          icon={Clock} 
          iconBg="#fef3c7" 
          iconColor="#b45309" 
          isActive={filter === 'pending'}
          onClick={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
        />
      </div>

      <ExpenseTable expenses={expenses} onVerify={onVerify} onDelete={onDelete} />

      <AddExpenseModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSubmit={onAddExpense} />
      <RecurringExpenses 
        isOpen={showRecurringModal} 
        onClose={() => setShowRecurringModal(false)} 
        recurring={recurring} 
        onAdd={onAddRecurring} 
        onToggle={onToggleRecurring} 
      />
    </div>
  );
}
