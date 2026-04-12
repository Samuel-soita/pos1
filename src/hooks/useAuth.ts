import { useState, useEffect } from 'react';
import { db, type Business, type Staff } from '../db/db';
import { supabase } from '../lib/supabase';

export function useAuth() {
  const [userType, setUserType] = useState<'owner' | 'staff' | null>(null);
  const [currentBusiness, setCurrentBusiness] = useState<Business | null>(null);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Persistence & Session Recovery
  useEffect(() => {
    async function loadSession() {
      const staffId = localStorage.getItem('staff_id');
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // We have a cloud session, verify local record
        const biz = await db.businesses.get(session.user.id);
        if (biz) {
          setCurrentBusiness(biz);
          if (!staffId) setUserType('owner');
        }
      }

      if (staffId) {
        const staff = await db.staff.get(staffId);
        if (staff) {
          setCurrentStaff(staff);
          setUserType('staff');
        }
      }
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
      
      // 5. Log the provisioning audit
      await supabase.from('provisioning_audit').insert([{
        business_id: businessId,
        engineer_id: 'SYSTEM_INSTALLER',
        device_metadata: { 
          userAgent: navigator.userAgent,
          activation_token: token.substring(0, 8) + '***'
        }
      }]);

      console.log(`Successfully provisioned business: ${businessCode}`);
      
      // 6. Sign out immediately so the background sync doesn't trigger 403s
      // The user must now log in via the AuthScreen to start a real session.
      await supabase.auth.signOut();
      
      return newBiz;
    } finally {
      setIsLoading(false);
    }
  };

  const businessLogin = async (businessCode: string, pin: string, email?: string) => {
    let finalEmail = email;

    // If email isn't provided (email-less login), look it up locally
    if (!finalEmail) {
      const biz = await db.businesses.where('code').equals(businessCode).first();
      if (!biz || !biz.ownerEmail) {
        throw new Error('Business not found or not provisioned correctly on this device. Please use Admin Provisioning.');
      }
      finalEmail = biz.ownerEmail;
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
       const { data: remoteBiz } = await supabase.from('businesses').select('*').eq('id', authData.user.id).single();
       if (remoteBiz) {
          const newBiz = {
            id: remoteBiz.id,
            name: remoteBiz.name,
            code: remoteBiz.code,
            pin: remoteBiz.pin,
            packageId: remoteBiz.package_id,
            expiryDate: remoteBiz.expiry_date,
            status: remoteBiz.status,
            trialUsed: remoteBiz.trial_used || false,
            suspendedRevenueCount: remoteBiz.suspended_revenue_count || 0,
            staffCount: remoteBiz.staff_count || 0
          };
          await db.businesses.put(newBiz);
         setCurrentBusiness(newBiz);
       }
    } else {
      setCurrentBusiness(biz);
    }

    setUserType('owner');
    localStorage.setItem('biz_id', authData.user.id);
    localStorage.setItem('pinned_biz_code', biz?.code || '');
    return biz;
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

    setCurrentStaff(staffRecord);
    setUserType('staff');
    localStorage.setItem('staff_id', staffRecord.id);
    return staffRecord;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('biz_id');
    localStorage.removeItem('staff_id');
    localStorage.removeItem('pinned_biz_code');
    setCurrentBusiness(null);
    setCurrentStaff(null);
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
