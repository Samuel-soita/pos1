import { db } from '../db/db';

/**
 * Multi-Tenant Isolation Verification Script
 * This can be run in the browser console or during a test suite.
 */
export async function verifyIsolation(activeBusinessId: string) {
  console.log('--- STARTING TENANT ISOLATION AUDIT ---');
  
  const tables = ['products', 'sales', 'expenses', 'staff', 'shifts', 'branches'];
  let fails = 0;

  for (const table of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allRecords = await (db as any)[table].toArray();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaked = allRecords.filter((r: any) => r.businessId !== activeBusinessId);
    
    if (leaked.length > 0) {
      console.error(`🚨 LEAK DETECTED in ${table}: Found ${leaked.length} records from other tenants!`);
      fails++;
    } else {
      console.log(`✅ ${table}: Isolation verified. (${allRecords.length} records found)`);
    }
  }

  if (fails === 0) {
    console.log('--- AUDIT PASSED: ZERO DATA LEAKAGE DETECTED ---');
  } else {
    console.error('--- AUDIT FAILED: FIX DATA ISOLATION IMMEDIATELY ---');
  }
}
