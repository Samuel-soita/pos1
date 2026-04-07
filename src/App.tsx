import { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Sales } from './components/Sales';
import { Inventory } from './components/Inventory';
import { History } from './components/History';
import { Settings } from './components/Settings';
import { Reports } from './components/Reports';
import { AuthScreen } from './components/AuthScreen';
import { useAuth } from './hooks/useAuth';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { businessId, isLoading } = useAuth();

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
    return <AuthScreen />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'sales':
        return <Sales />;
      case 'inventory':
        return <Inventory />;
      case 'history':
        return <History />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

export default App;
