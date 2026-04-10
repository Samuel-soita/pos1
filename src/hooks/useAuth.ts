import { useState, useEffect } from 'react';
import { db, type Business, type Staff } from '../db/db';

export function useAuth() {
  const [userType, setUserType] = useState<'owner' | 'staff' | null>(null);
  const [currentBusiness, setCurrentBusiness] = useState<Business | null>(null);
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Persistence
  useEffect(() => {
    async function loadSession() {
      const bizId = localStorage.getItem('biz_id');
      const staffId = localStorage.getItem('staff_id');
      
      if (bizId) {
        const biz = await db.businesses.get(bizId);
        if (biz) {
          setCurrentBusiness(biz);
          setUserType('owner');
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

  const businessLogin = async (name: string, businessCode: string, pin: string) => {
    // In a real app, this would query Supabase for the specific business record
    const biz = await db.businesses
      .where({ name: name.trim(), code: businessCode.trim(), pin: pin.trim() })
      .first();
      
    if (!biz) throw new Error('Invalid Business Name, Code, or PIN');
    
    setCurrentBusiness(biz);
    setUserType('owner');
    localStorage.setItem('biz_id', biz.id);
    return biz;
  };

  const staffLogin = async (businessCode: string, staffCode: string, pin: string) => {
    const biz = await db.businesses.where('code').equals(businessCode).first();
    if (!biz) throw new Error('Business Code not found');

    const staff = await db.staff
      .where({ businessId: biz.id, code: staffCode.trim(), pin: pin.trim() })
      .first();

    if (!staff) throw new Error('Invalid Staff Code or PIN');

    setCurrentStaff(staff);
    setUserType('staff');
    localStorage.setItem('staff_id', staff.id);
    localStorage.setItem('biz_id', biz.id); // Also store bizId for data scoping
    return staff;
  };

  const engineerSetup = async (name: string, code: string, pin: string, customFeatureCount: number = 0) => {
    // Global Engineer Code check
    if (pin !== '0000') throw new Error('Unauthorized: Invalid Engineer Tech Code');

    const id = crypto.randomUUID();
    const newBiz: Business = {
      id,
      name,
      code,
      pin: '1234', // Default PIN for the business owner to change later
      packageId: 'hustler',
      expiryDate: Date.now() + 5 * 24 * 60 * 60 * 1000,
      status: 'active',
      staffCount: 0,
      customFeatureCount
    };
    await db.businesses.add(newBiz);
    return newBiz;
  };

  const logout = () => {
    localStorage.removeItem('biz_id');
    localStorage.removeItem('staff_id');
    setCurrentBusiness(null);
    setCurrentStaff(null);
    setUserType(null);
  };

  const businessId = currentBusiness?.id || currentStaff?.businessId || localStorage.getItem('biz_id');

  return { 
    userType, 
    business: currentBusiness, 
    staff: currentStaff, 
    businessId, 
    isLoading, 
    businessLogin, 
    staffLogin, 
    engineerSetup, 
    logout 
  };
}
