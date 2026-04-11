import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Sales } from './components/Sales';
import { Inventory } from './components/Inventory';
import { History } from './components/History';
import { Settings } from './components/Settings';
import { Reports } from './components/Reports';
import { Expenses } from './components/Expenses';
import { AuthScreen } from './components/AuthScreen';
import { StaffManagement } from './components/StaffManagement';
import { PackageSelection } from './components/PackageSelection';
import { useAuth } from './hooks/useAuth';

import { InstallBanner } from './components/InstallBanner';
import { PaymentModal } from './components/PaymentModal';
import { useSubscription } from './hooks/useSubscription';
import { useRecurringExpenses } from './hooks/useRecurringExpenses';

import { UpdateManager } from './components/UpdateManager';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { businessId, isLoading, business, userType } = useAuth();
  const { status, needsDeposit } = useSubscription();

  // Initialize background processors
  useRecurringExpenses();

  useEffect(() => {
    const requestPersistentStorage = async () => {
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
          const granted = await navigator.storage.persist();
          console.log(`Persistent storage granted: ${granted}`);
        }
      }
    };
    requestPersistentStorage();
  }, []);

  if (isLoading) {
    return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;
  }

  if (!businessId) {
    return (
      <>
        <AuthScreen />
        <InstallBanner />
        <UpdateManager />
      </>
    );
  }

  if (userType === 'owner' && !business?.packageId) {
    return (
      <Layout activeTab="settings" setActiveTab={setActiveTab}>
        <PackageSelection />
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
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard onTabChange={setActiveTab} />;
    }
  };

  return (
    <>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        {renderContent()}
      </Layout>
      <InstallBanner />
      <PaymentModal status={status} needsDeposit={!!needsDeposit} />
      <UpdateManager />
    </>
  );
}

export default App;
