import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, type Business, type Staff } from '../db/db';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  userType: 'owner' | 'staff' | null;
  business: Business | null;
  staff: Staff | null;
  businessId: string | null;
  branchId: string | null;
  staffId: string | null;
  branches: import('../db/db').Branch[];
  isLoading: boolean;
  isOptimisticReady: boolean;
  setAuthState: (state: Partial<AuthContextType>) => void;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userType, setUserType] = useState<'owner' | 'staff' | null>(() => {
    if (localStorage.getItem('staff_id')) return 'staff';
    if (localStorage.getItem('biz_id')) return 'owner';
    return null;
  });
  const [bizIdState, setBizIdState] = useState(() => localStorage.getItem('biz_id'));
  const [staffIdState, setStaffIdState] = useState(() => localStorage.getItem('staff_id'));
  const [business, setBusiness] = useState<Business | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [branches, setBranches] = useState<import('../db/db').Branch[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    if (bizIdState) {
      db.branches.where('businessId').equals(bizIdState).toArray().then(setBranches);
    } else {
      setBranches([]);
    }
  }, [bizIdState]);

  const refreshAuth = async () => {
    const storedBizId = localStorage.getItem('biz_id');
    const storedStaffId = localStorage.getItem('staff_id');
    
    if (storedStaffId) {
      setStaffIdState(storedStaffId);
      setUserType('staff');
      const s = await db.staff.get(storedStaffId);
      setStaff(s || null);
      if (s?.businessId) {
        setBizIdState(s.businessId);
        const b = await db.businesses.get(s.businessId);
        setBusiness(b || null);
      }
    } else if (storedBizId) {
      setBizIdState(storedBizId);
      setUserType('owner');
      const b = await db.businesses.get(storedBizId);
      setBusiness(b || null);
      setStaff(null);
      setStaffIdState(null);
    } else {
      setBizIdState(null);
      setStaffIdState(null);
      setUserType(null);
      setBusiness(null);
      setStaff(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    async function loadSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          localStorage.setItem('biz_id', session.user.id);
        }
        await refreshAuth();
      } finally {
        if (mounted) setSessionLoading(false);
      }
    }
    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('biz_id');
        localStorage.removeItem('staff_id');
        await refreshAuth();
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (session?.user) {
          localStorage.setItem('biz_id', session.user.id);
          await refreshAuth();
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    userType,
    business,
    staff,
    branches,
    businessId: bizIdState,
    staffId: staffIdState,
    branchId: staff?.branchId || null,
    isLoading: sessionLoading,
    isOptimisticReady: !!bizIdState || !!staffIdState,
    setAuthState: (state: Partial<AuthContextType>) => {
      if (state.userType !== undefined) setUserType(state.userType);
      if (state.businessId !== undefined) setBizIdState(state.businessId);
      if (state.staffId !== undefined) setStaffIdState(state.staffId);
      if (state.business !== undefined) setBusiness(state.business);
      if (state.staff !== undefined) setStaff(state.staff);
    },
    refreshAuth
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used within AuthProvider');
  return context;
}
