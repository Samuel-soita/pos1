import { useState, useEffect } from 'react';
import { db, type Business } from '../db/db';
import { supabase } from '../lib/supabase';
import { useLiveQuery } from 'dexie-react-hooks';

export function useAuth() {
  const [userType, setUserType] = useState<'owner' | 'staff' | null>(() => {
    if (localStorage.getItem('staff_id')) return 'staff';
    if (localStorage.getItem('biz_id')) return 'owner';
    return null;
  });
  const [bizIdState, setBizIdState] = useState(() => localStorage.getItem('biz_id'));
  const [staffIdState, setStaffIdState] = useState(() => localStorage.getItem('staff_id'));
  const [isLoading, setIsLoading] = useState(!bizIdState && !staffIdState);

  const currentBusiness = useLiveQuery(
    async () => bizIdState ? await db.businesses.get(bizIdState) : null,
    [bizIdState]
  );

  const currentStaff = useLiveQuery(
    async () => staffIdState ? await db.staff.get(staffIdState) : null,
    [staffIdState]
  );

  const branches = useLiveQuery(
    async () => bizIdState ? await db.branches.where('businessId').equals(bizIdState).toArray() : [],
    [bizIdState]
  ) || [];

  // Persistence & Session Recovery
  useEffect(() => {
    async function loadSession() {
      const storedBizId = localStorage.getItem('biz_id');
      const storedStaffId = localStorage.getItem('staff_id');
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (storedStaffId) {
        setStaffIdState(storedStaffId);
        setUserType('staff');
      } else if (session) {
        setBizIdState(session.user.id);
        setUserType('owner');
      } else if (storedBizId) {
        setBizIdState(storedBizId);
        setUserType('owner');
      }

      // If we didn't show the dashboard optimistically, show it now
      setIsLoading(false);
    }
    loadSession();
  }, []);

  const provisionBusiness = async (token: string, name: string, pin: string, email: string) => {
    setIsLoading(true);
    try {
      // 1. Validate the Activation Token (Checking for Master Token Override first)
      const MASTER_TOKEN = 'SMUTA-SOITA -MASTER-2026';
      let isValid = token.trim() === MASTER_TOKEN.trim();

      if (!isValid) {
        const { data, error: tokenError } = await supabase.rpc('validate_provisioning_token', { 
          p_token: token.trim() 
        });
        if (tokenError) throw new Error(`Token validation failed: ${tokenError.message}`);
        isValid = data;
      }

      if (!isValid) throw new Error('Invalid or Expired Activation Token. Access Denied.');

      // 2. Fetch the secure randomized Business Code (e.g. A7K-9P2)
      const { data: businessCode, error: codeError } = (await supabase.rpc('get_secure_business_code')) as { data: string | null, error: { message: string } | null };
      if (codeError || !businessCode) throw new Error(`Could not generate secure business code: ${codeError?.message || 'Empty response'}`);

      // 3. Register the Business Owner in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: pin.padStart(6, '0'),
        options: {
          data: { business_name: name, business_code: businessCode }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Provisioning failed: No user created.');

      const businessId = authData.user.id;

      // 4. Create the business record in Dexie
      const newBiz: Business = {
        id: businessId,
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
      
      // 5. Log the provisioning audit (Permanent Registry)
      await supabase.from('provisioning_audit').insert([{
        business_id: businessId,
        business_code: businessCode, // NEW: Explicitly store code in registry
        engineer_id: 'SYSTEM_INSTALLER',
        device_metadata: { 
          userAgent: navigator.userAgent,
          activation_token: token.substring(0, 8) + '***'
        }
      }]);

      // 6. Direct Entry: Setup session pointers immediately
      setBizIdState(businessId);
      setUserType('owner');
      localStorage.setItem('biz_id', businessId);
      localStorage.setItem('pinned_biz_code', businessCode);
      localStorage.setItem('initial_sync_done', 'true'); // First device is fresh
      
      return newBiz;
    } finally {
      setIsLoading(false);
    }
  };

  const businessLogin = async (businessCode: string, pin: string, email?: string) => {
    let finalEmail = email;

    // If email isn't provided (email-less login), look it up locally then cloud resolver
    if (!finalEmail) {
      const biz = await db.businesses.where('code').equals(businessCode).first();
      if (biz?.ownerEmail) {
        finalEmail = biz.ownerEmail;
      } else {
        // New Device Case: Resolve Email from Cloud using Business Code
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

    // Perform Supabase Login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: finalEmail,
      password: pin.padStart(6, '0')
    });

    if (authError) throw authError;

    const biz = await db.businesses.get(authData.user.id);
    if (!biz) {
       // If local record is missing but cloud exists, sync it down
       const { data: remoteBiz } = await supabase
         .from('businesses')
         .select('id, name, code, pin, package_id, expiry_date, status, trial_used, suspended_revenue_count, staff_count, mpesa_config, enabled_features, telephone, address, kra_pin')
         .eq('id', authData.user.id)
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
            kraPin: remoteBiz.kra_pin || ''
          };
          await db.businesses.put(newBiz);
          setBizIdState(newBiz.id);
       }
    } else {
      setBizIdState(biz.id);
    }

    setUserType('owner');
    localStorage.setItem('biz_id', authData.user.id);
    localStorage.setItem('pinned_biz_code', biz?.code || '');
    
    // Day-Zero Bootstrap: fetch essential entities immediately
    await syncBootstrapData(authData.user.id);
    
    return biz;
  };

  const syncBootstrapData = async (bizId: string) => {
    try {
      console.log('[Bootstrap] Initializing State Sync for Business:', bizId);
      
      // 1. Fetch Branches
      const { data: branches } = await supabase.from('branches').select('*').eq('business_id', bizId);
      if (branches) {
        await db.branches.bulkPut(branches.map(b => ({
          id: b.id,
          businessId: b.business_id,
          name: b.name
        })));
      }

      // 2. Fetch All Staff
      const { data: staff } = await supabase.from('staff').select('*').eq('business_id', bizId);
      if (staff) {
        await db.staff.bulkPut(staff.map(s => ({
          id: s.id,
          businessId: s.business_id,
          branchId: s.branch_id,
          code: s.code,
          pin: s.pin,
          firstName: s.first_name,
          lastName: s.last_name,
          phoneNumber: s.phone_number,
          idNumber: s.id_number,
          status: s.status,
          role: s.role
        })));
      }

      // 3. Fetch Suppliers
      const { data: suppliers } = await supabase.from('suppliers').select('*').eq('business_id', bizId);
      if (suppliers) {
        await db.suppliers.bulkPut(suppliers.map(s => ({
          id: s.id,
          businessId: s.business_id,
          name: s.name,
          contactPerson: s.contact_person,
          phone: s.phone,
          email: s.email,
          kraPin: s.kra_pin
        })));
      }
      
      console.log('[Bootstrap] Day-Zero State Loaded Successfully');
    } catch (err) {
      console.warn('[Bootstrap] Semi-failure during entity pre-fetch:', err);
      // Non-blocking failure; the event materializer will eventually catch up
    }
  };

  const staffLogin = async (staffCode: string, pin: string) => {
    const bizId = localStorage.getItem('biz_id');
    if (!bizId) throw new Error('No Business session active on this device.');

    let isValid = false;
    let staffRecord = null;

    if (navigator.onLine) {
      try {
        // Enforce cloud verification to protect against offline PIN spoofing/revoked access
        const { data, error } = await supabase.rpc('verify_staff_online', {
          p_business_id: bizId,
          p_code: staffCode.trim(),
          p_pin: pin.trim()
        });
        
        if (error) throw error;
        isValid = data === true;
        
        if (isValid) {
          // Cloud validated. Fetch raw node to cache 
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
            // Cache locally and reset 48-hour deadman switch
            await db.staff.put(staffRecord);
            localStorage.setItem(`staff_auth_time_${staffRecord.id}`, Date.now().toString());
          }
        }
      } catch (err) {
        console.warn('Live verification failed, dropping to offline mode:', err);
      }
    }

    // Fallback or Offline Execution
    if (!staffRecord) {
      staffRecord = await db.staff
        .where({ businessId: bizId, code: staffCode.trim(), pin: pin.trim() })
        .first();
      
      if (staffRecord) {
         // Security dead-man switch: Force an online sync every 48 hours for staff
         const lastAuthTime = parseInt(localStorage.getItem(`staff_auth_time_${staffRecord.id}`) || '0', 10);
         const hoursSinceAuth = (Date.now() - lastAuthTime) / (1000 * 60 * 60);
         
         if (hoursSinceAuth > 48) {
           throw new Error('Offline shift limit reached. Please connect to the internet to initialize this register.');
         }
         isValid = true;
      }
    }

    if (!isValid || !staffRecord) throw new Error('Invalid Staff Code or PIN');

    setStaffIdState(staffRecord.id);
    setUserType('staff');
    localStorage.setItem('staff_id', staffRecord.id);

    // Bootstrap for staff too so they have branch context/suppliers immediately
    await syncBootstrapData(bizId);

    return staffRecord;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('biz_id');
    localStorage.removeItem('staff_id');
    localStorage.removeItem('pinned_biz_code');
    setBizIdState(null);
    setStaffIdState(null);
    setUserType(null);
    window.location.reload();
  };

  const businessId = currentBusiness?.id || currentStaff?.businessId || localStorage.getItem('biz_id');
  const branchId = currentStaff?.branchId || localStorage.getItem('branch_id');
  const staffId = currentStaff?.id || localStorage.getItem('staff_id');

  return { 
    userType,
    business: currentBusiness, 
    staff: currentStaff, 
    branches,
    businessId,
    branchId,
    staffId,
    isLoading, 
    businessLogin, 
    staffLogin, 
    provisionBusiness, 
    logout 
  };
}
