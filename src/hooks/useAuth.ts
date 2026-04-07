import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [offlineBusinessId, setOfflineBusinessId] = useState<string | null>(localStorage.getItem('offlineBusinessId'));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        localStorage.setItem('offlineBusinessId', session.user.id);
        setOfflineBusinessId(session.user.id);
      }
      setIsLoading(false);
    });

    // Listen to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
         localStorage.setItem('offlineBusinessId', session.user.id);
         setOfflineBusinessId(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const register = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    localStorage.removeItem('offlineBusinessId');
    setOfflineBusinessId(null);
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // If session drops (e.g. JWT expires while totally offline), fall back to the cached ID!
  const businessId = session?.user?.id || offlineBusinessId;

  return { session, businessId, isLoading, login, register, logout };
}
