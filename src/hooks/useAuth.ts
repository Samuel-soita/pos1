import { useState } from 'react';
import { db, type Business } from '../db/db';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../context/AuthContext';

export function useAuth() {
  const { 
    userType, 
    business, 
    staff, 
    businessId, 
    branchId, 
    staffId, 
    branches,
    isLoading: contextLoading, 
    isOptimisticReady, 
    refreshAuth 
  } = useAuthContext();

  const [manualLoading, setManualLoading] = useState(false);
  const isLoading = contextLoading || manualLoading;

  const provisionBusiness = async (token: string, name: string, pin: string, email: string) => {
    setManualLoading(true);
    try {
      const MASTER_TOKEN = 'SMUTA-SOITA-MASTER-2026';
      let isValid = token.trim() === MASTER_TOKEN.trim();

      if (!isValid) {
        const { data, error: tokenError } = await supabase.rpc('validate_provisioning_token', { 
          p_token: token.trim() 
        });
        if (tokenError) throw new Error(`Token validation failed: ${tokenError.message}`);
        isValid = data;
      }

      if (!isValid) throw new Error('Invalid or Expired Activation Token. Access Denied.');

      const { data: businessCode, error: codeError } = (await supabase.rpc('get_secure_business_code')) as { data: string | null, error: { message: string } | null };
      if (codeError || !businessCode) throw new Error(`Could not generate secure business code: ${codeError?.message || 'Empty response'}`);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: pin.padStart(6, '0'),
        options: {
          data: { business_name: name, business_code: businessCode }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Provisioning failed: No user created.');

      const bizId = authData.user.id;

      const newBiz: Business = {
        id: bizId,
        name,
        code: businessCode,
        pin,
        ownerEmail: email || '',
        packageId: 'hustler',
        expiryDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
        status: 'active',
        trialUsed: false,
        suspendedRevenueCount: 0,
        staffCount: 0
      };

      await db.businesses.put(newBiz);
      
      await supabase.from('provisioning_audit').insert([{
        business_id: bizId,
        business_code: businessCode,
        engineer_id: 'SYSTEM_INSTALLER',
        device_metadata: { 
          userAgent: navigator.userAgent,
          activation_token: token.substring(0, 8) + '***'
        }
      }]);

      localStorage.setItem('biz_id', bizId);
      localStorage.setItem('pinned_biz_code', businessCode);
      localStorage.setItem('initial_sync_done', 'true');
      
      await refreshAuth();
      return newBiz;
    } finally {
      setManualLoading(false);
    }
  };

  const businessLogin = async (businessCode: string, pin: string, email?: string) => {
    let finalEmail = email;

    if (!finalEmail) {
      const biz = await db.businesses.where('code').equals(businessCode).first();
      if (biz?.ownerEmail) {
        finalEmail = biz.ownerEmail;
      } else {
        const { data: cloudEmail, error: resolveErr } = await supabase.rpc('resolve_business_email', {
          p_code: businessCode
        });
        
        if (resolveErr || !cloudEmail) {
          throw new Error('Business Code not found. Please verify the code or contact support.');
        }
        finalEmail = cloudEmail;
      }
    }

    if (!finalEmail) {
      throw new Error('Could not resolve business email. Please contact support.');
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: finalEmail,
      password: pin.padStart(6, '0')
    });

    if (authError) throw authError;

    const bizId = authData.user.id;
    const biz = await db.businesses.get(bizId);
    
    if (!biz) {
       const { data: remoteBiz } = await supabase
         .from('businesses')
         .select('*')
         .eq('id', bizId)
         .maybeSingle();

       if (remoteBiz) {
          const newBiz: Business = {
            id: remoteBiz.id,
            name: remoteBiz.name || '',
            code: remoteBiz.code || '',
            pin: remoteBiz.pin || '',
            packageId: remoteBiz.package_id || 'hustler',
            expiryDate: Number(remoteBiz.expiry_date) || Date.now(),
            status: (remoteBiz.status as Business['status']) || 'active',
            trialUsed: remoteBiz.trial_used || false,
            suspendedRevenueCount: remoteBiz.suspended_revenue_count || 0,
            staffCount: remoteBiz.staff_count || 0,
            enabledFeatures: remoteBiz.enabled_features || [],
            mpesaConfig: remoteBiz.mpesa_config || undefined,
            telephone: remoteBiz.telephone || '',
            address: remoteBiz.address || '',
            kraPin: remoteBiz.kra_pin || '',
            logo: remoteBiz.logo || undefined
          };
          await db.businesses.put(newBiz);
       }
    }

    localStorage.setItem('biz_id', bizId);
    localStorage.setItem('pinned_biz_code', biz?.code || '');
    
    await syncBootstrapData(bizId);
    await refreshAuth();
    
    return biz;
  };

  const syncBootstrapData = async (bizId: string) => {
    try {
      console.log('[Bootstrap] Initializing High-Fidelity State Sync for:', bizId);
      
      const tables = [
        'businesses', 'branches', 'staff', 'suppliers', 'products', 
        'sales', 'expenses', 'purchases', 'shifts', 
        'cash_logs', 'settings', 'recurring_expenses', 'counters',
        'inventory_ledger', 'carts'
      ];

      for (const table of tables) {
        let hasMore = true;
        let page = 0;
        const pageSize = 1000;

        while (hasMore) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('business_id', bizId)
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (error) {
            console.warn(`[Bootstrap] Failed to fetch ${table} (page ${page}):`, error.message);
            hasMore = false;
            continue;
          }

          if (data && data.length > 0) {
            // Map snake_case to camelCase where necessary
            const mappedData = data.map(item => {
              const mapped: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
                const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase())
                                  .replace('businessId', 'businessId') // keep businessId
                                  .replace('branchId', 'branchId')
                                  .replace('staffId', 'staffId')
                                  .replace('supplierId', 'supplierId');
                mapped[camelKey] = value;
                // Fix some common mismatches
                if (key === 'business_id') mapped.businessId = value;
                if (key === 'branch_id') mapped.branchId = value;
                if (key === 'staff_id') mapped.staffId = value;
                if (key === 'supplier_id') mapped.supplierId = value;
                if (key === 'package_id') mapped.packageId = value;
                if (key === 'expiry_date') mapped.expiryDate = Number(value);
                if (key === 'trial_used') mapped.trialUsed = value;
                if (key === 'suspended_revenue_count') mapped.suspendedRevenueCount = value;
                if (key === 'staff_count') mapped.staffCount = value;
                if (key === 'mpesa_config') mapped.mpesaConfig = value;
                if (key === 'enabled_features') mapped.enabledFeatures = value;
                if (key === 'kra_pin') mapped.kraPin = value;
                if (key === 'low_stock_threshold') mapped.lowStockThreshold = value;
                if (key === 'cost_price') mapped.costPrice = value;
                if (key === 'entity_type') mapped.entityType = value;
                if (key === 'is_active') mapped.isActive = value;
                if (key === 'next_run') mapped.nextRun = value;
                if (key === 'recorded_at') mapped.recordedAt = Number(value);
                if (key === 'trace_id') mapped.traceId = value;
                if (key === 'updated_at') mapped.updatedAt = Number(value);
                if (key === 'logo') mapped.logo = value;
                if (key === 'staff_permissions') mapped.staffPermissions = value;
              }
              return mapped;
            });

            // Custom handling for settings
            if (table === 'settings') {
               await db.settings.bulkPut(mappedData.map(s => ({ key: s.key as string, value: s.value })));
            } else {
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               await (db as any)[table].bulkPut(mappedData);
            }

            if (data.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        }
      }

      // CRITICAL: Fetch the latest event to set the cursor
      const { data: lastEvent } = await supabase
        .from('pos_events')
        .select('server_timestamp')
        .eq('business_id', bizId)
        .order('server_timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastEvent?.server_timestamp) {
        await db.settings.put({ key: 'last_synced', value: Number(lastEvent.server_timestamp) });
        console.log('[Bootstrap] Sync cursor established at:', lastEvent.server_timestamp);
      }

      localStorage.setItem('initial_sync_done', 'true');
      console.log('[Bootstrap] Full State Recovery Complete');
    } catch (err) {
      console.error('[Bootstrap] Critical failure during data fetch:', err);
    }
  };

  const staffLogin = async (staffCode: string, pin: string) => {
    const bizId = localStorage.getItem('biz_id');
    if (!bizId) throw new Error('No Business session active on this device.');

    let isValid = false;
    let staffRecord = null;

    if (navigator.onLine) {
      try {
        const { data, error } = await supabase.rpc('verify_staff_online', {
          p_business_id: bizId,
          p_code: staffCode.trim(),
          p_pin: pin.trim()
        });
        
        if (error) throw error;
        isValid = data === true;
        
        if (isValid) {
          const { data: cloudStaff } = await supabase
            .from('staff')
            .select('*')
            .eq('business_id', bizId)
            .eq('code', staffCode.trim())
            .single();

          if (cloudStaff) {
            staffRecord = {
              id: cloudStaff.id,
              businessId: cloudStaff.business_id,
              code: cloudStaff.code,
              pin: cloudStaff.pin,
              idNumber: cloudStaff.id_number,
              phoneNumber: cloudStaff.phone_number,
              firstName: cloudStaff.first_name,
              lastName: cloudStaff.last_name,
              status: cloudStaff.status,
              branchId: cloudStaff.branch_id
            };
            await db.staff.put(staffRecord);
            localStorage.setItem(`staff_auth_time_${staffRecord.id}`, Date.now().toString());
          }
        }
      } catch (err) {
        console.warn('Live verification failed, dropping to offline mode:', err);
      }
    }

    if (!staffRecord) {
      staffRecord = await db.staff
        .where({ businessId: bizId, code: staffCode.trim(), pin: pin.trim() })
        .first();
      
      if (staffRecord) {
         const lastAuthTime = parseInt(localStorage.getItem(`staff_auth_time_${staffRecord.id}`) || '0', 10);
         const hoursSinceAuth = (Date.now() - lastAuthTime) / (1000 * 60 * 60);
         
         if (hoursSinceAuth > 48) {
           throw new Error('Offline shift limit reached. Please connect to the internet.');
         }
         isValid = true;
      }
    }

    if (!isValid || !staffRecord) throw new Error('Invalid Staff Code or PIN');

    localStorage.setItem('staff_id', staffRecord.id);
    await syncBootstrapData(bizId);
    await refreshAuth();

    return staffRecord;
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      
      // Clear local database to prevent cross-contamination
      await db.transaction('rw', db.tables, async () => {
        await Promise.all(db.tables.map(table => table.clear()));
      });

      localStorage.removeItem('biz_id');
      localStorage.removeItem('staff_id');
      localStorage.removeItem('pinned_biz_code');
      localStorage.removeItem('initial_sync_done');
      
      await refreshAuth();
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
      // Fallback: still clear storage and reload
      localStorage.clear();
      window.location.reload();
    }
  };

  return { 
    userType,
    business, 
    staff, 
    branches,
    businessId,
    branchId,
    staffId,
    isLoading, 
    isOptimisticReady,
    businessLogin, 
    staffLogin, 
    provisionBusiness, 
    logout 
  };
}
