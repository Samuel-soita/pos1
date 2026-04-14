import { createContext, useContext, type ReactNode } from 'react';

interface LayoutContextType {
  requestAuth: (callback: () => void) => void;
}

export const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) throw new Error('useLayout must be used within Layout');
  return context;
}

export interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}
