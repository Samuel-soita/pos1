import { useState, useEffect, lazy, Suspense } from 'react';
import { Layout } from './components/Layout';
import { useAuth } from './hooks/useAuth';
import { useSubscription } from './hooks/useSubscription';
import { useRecurringExpenses } from './hooks/useRecurringExpenses';
import { InstallBanner } from './components/InstallBanner';
import { PaymentModal } from './components/PaymentModal';
import { UpdateManager } from './components/UpdateManager';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { verifyLedgerIntegrity } from './lib/AntiCorruptionLayer';
import { useCompaction } from './hooks/useCompaction';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { Sparkles, CheckCircle2 } from 'lucide-react';

// Lazy load feature components
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));
const Sales = lazy(() => import('./components/Sales').then(module => ({ default: module.Sales })));
const Inventory = lazy(() => import('./components/Inventory').then(module => ({ default: module.Inventory })));
const History = lazy(() => import('./components/History').then(module => ({ default: module.History })));
const Settings = lazy(() => import('./components/Settings').then(module => ({ default: module.Settings })));
const Reports = lazy(() => import('./components/Reports').then(module => ({ default: module.Reports })));
const Expenses = lazy(() => import('./components/Expenses').then(module => ({ default: module.Expenses })));
const StaffManagement = lazy(() => import('./components/StaffManagement').then(module => ({ default: module.StaffManagement })));
const AuthScreen = lazy(() => import('./components/AuthScreen').then(module => ({ default: module.AuthScreen })));
const PackageSelection = lazy(() => import('./components/PackageSelection').then(module => ({ default: module.PackageSelection })));
const SyncDashboard = lazy(() => import('./components/SyncDashboard').then(module => ({ default: module.SyncDashboard })));

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { businessId, isLoading, business, userType } = useAuth();
  const { status } = useSubscription();

  // Initialize background processors
  useRecurringExpenses();
  const { compactOldData } = useCompaction();

  useEffect(() => {
    if (businessId) {
      verifyLedgerIntegrity(businessId);
      
      // Run Compaction Check (Debounced by 24 hours internally usually, but we call it here)
      compactOldData();
    }
  }, [businessId, compactOldData]);

  // First Sale Celebration Logic
  const salesCount = useLiveQuery(() => db.sales.count()) || 0;
  const alreadyCelebrated = useLiveQuery(async () => {
    const setting = await db.settings.get('first_sale_celebrated');
    return !!setting?.value;
  }, []) ?? true; // Default to true while loading
  
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (salesCount === 1 && !alreadyCelebrated) {
      setTimeout(() => setShowCelebration(true), 1500); // Small delay to let success modal close
    }
  }, [salesCount, alreadyCelebrated]);

  const handleFinishCelebration = async () => {
    await db.settings.put({ key: 'first_sale_celebrated', value: true });
    setShowCelebration(false);
  };

  useEffect(() => {
    const requestPersistentStorage = async () => {
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
          await navigator.storage.persist();
        }
      }
    };
    requestPersistentStorage();
  }, []);

  // Idle Background Prefetching: 
  // Keeps initial boot fast (lazy loading), but silently downloads tabs in the background 
  // so that when the user clicks 'Sales' or 'Inventory', it loads instantly with zero jank.
  useEffect(() => {
    if (businessId) {
      const timer = setTimeout(() => {
        import('./components/Sales');
        import('./components/Inventory');
        import('./components/Dashboard');
        import('./components/Settings');
        import('./components/Reports');
        import('./components/Expenses');
        import('./components/StaffManagement');
        import('./components/History');
      }, 1500); // 1.5 seconds after boot (when the network is quiet)
      return () => clearTimeout(timer);
    }
  }, [businessId]);

  if (isLoading) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!businessId) {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <AuthScreen />
        <InstallBanner />
        <UpdateManager />
      </Suspense>
    );
  }

  if (userType === 'owner' && !business?.packageId) {
    return (
      <Layout activeTab="settings" setActiveTab={setActiveTab}>
        <Suspense fallback={<LoadingSkeleton />}>
          <PackageSelection />
        </Suspense>
      </Layout>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onTabChange={setActiveTab} />;
      case 'sales':
        return <Sales />;
      case 'inventory':
        return <Inventory />;
      case 'staff':
        return <StaffManagement />;
      case 'history':
        return <History />;
      case 'reports':
        return <Reports />;
      case 'expenses':
        return <Expenses />;
      case 'recurring-expenses':
        return <Expenses initialView="recurring" />;
      case 'settings':
        return <Settings />;
      case 'subscription':
        return <PackageSelection />;
      case 'sync':
        return <SyncDashboard />;
      case 'shift-logs':
        return <StaffManagement initialView="shifts" />;
      case 'branches':
        return <StaffManagement initialView="branches" />;
      default:
        return <Dashboard onTabChange={setActiveTab} />;
    }
  };

  return (
    <>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        <Suspense fallback={<LoadingSkeleton />}>
          {renderContent()}
        </Suspense>
      </Layout>
      <InstallBanner />
      <PaymentModal status={status} needsDeposit={false} />
      <UpdateManager />
      
      {showCelebration && (
        <div className="celebration-overlay">
          <div style={{ maxWidth: '400px', animation: 'welcome-fade-in 1s ease-out' }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: '24px' }}>
              <div style={{ 
                width: '120px', 
                height: '120px', 
                background: 'var(--success)', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 0 40px rgba(34, 197, 94, 0.5)',
                animation: 'pulse 2s infinite'
              }}>
                <CheckCircle2 color="white" size={64} />
              </div>
              <Sparkles 
                size={40} 
                style={{ position: 'absolute', top: -10, right: -10, color: 'var(--warning)', animation: 'spin 4s linear infinite' }} 
              />
            </div>
            
            <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '16px', color: 'var(--text)' }}>
              Success!
            </h1>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '24px', color: 'var(--primary)' }}>
              Your first sale is complete!
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '40px', lineHeight: 1.6 }}>
              You are now officially ready to run your business with <strong>SMUTA PAY</strong>.
            </p>
            
            <button 
              className="btn-primary" 
              style={{ width: '100%', height: '64px', fontSize: '1.25rem', borderRadius: '32px' }}
              onClick={handleFinishCelebration}
            >
              Get Started
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
