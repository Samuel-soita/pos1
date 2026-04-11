-- Enable RLS on all sensitive tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 1. Multi-Tenant Isolation Policy (Sales)
-- A user can only insert/select rows matching the auth.uid() mapped business_id.
CREATE POLICY "Strict Tenant Isolation (Sales)" 
ON sales 
FOR ALL 
USING (
  business_id IN (
    SELECT id FROM businesses WHERE owner_uid = auth.uid()
  )
);

CREATE POLICY "Strict Tenant Isolation (Expenses)" 
ON expenses 
FOR ALL 
USING (
  business_id IN (
    SELECT id FROM businesses WHERE owner_uid = auth.uid()
  )
);

CREATE POLICY "Strict Tenant Isolation (Products)" 
ON products 
FOR ALL 
USING (
  business_id IN (
    SELECT id FROM businesses WHERE owner_uid = auth.uid()
  )
);

CREATE POLICY "Strict Tenant Isolation (Businesses)" 
ON businesses 
FOR ALL 
USING (
  owner_uid = auth.uid()
);

-- 3. Inventory Event Ledger Table
CREATE TABLE IF NOT EXISTS inventory_ledger (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    action TEXT NOT NULL, -- 'ADD', 'SALE', 'REFUND', 'WASTE'
    quantity DECIMAL NOT NULL,
    recorded_at BIGINT NOT NULL
);

ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Strict Tenant Isolation (Inventory Ledger)" 
ON inventory_ledger 
FOR ALL 
USING (
  business_id IN (
    SELECT id FROM businesses WHERE owner_uid = auth.uid()
  )
);

CREATE INDEX idx_inventory_product ON inventory_ledger(product_id, business_id);

-- 2. Prevent Overwrites (Append-Only Enforcement)
-- Revoke UPDATE and DELETE commands on ledgers entirely
REVOKE UPDATE, DELETE ON sales FROM authenticated;
REVOKE UPDATE, DELETE ON inventory_ledger FROM authenticated;
