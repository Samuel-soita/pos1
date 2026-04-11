-- ==========================================
-- Supabase Schema for Offline-First POS (Premium Multi-Tenant Edition)
-- ==========================================

-- 1. Hardening Existing Tables
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS package_id TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS expiry_date BIGINT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'sole_proprietor';


-- 2. Products Extra Columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold DECIMAL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at BIGINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quantity_non_negative') THEN
        ALTER TABLE products ADD CONSTRAINT quantity_non_negative CHECK (quantity >= 0);
    END IF;
END $$;


-- 3. Create Event-Sourced Core
CREATE TABLE IF NOT EXISTS pos_events (
    event_id UUID PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    staff_id TEXT,
    event_type TEXT NOT NULL,      -- 'sale_created', 'stock_reserved', 'stock_committed'
    payload JSONB NOT NULL,
    client_timestamp BIGINT NOT NULL,
    server_timestamp BIGINT DEFAULT extract(epoch from now()) * 1000,
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Protect Event Immutability (Append-Only)
REVOKE UPDATE, DELETE ON pos_events FROM authenticated;

-- Event Indexing for Cursors
CREATE INDEX IF NOT EXISTS idx_pos_events_cursor ON pos_events(business_id, server_timestamp);

-- 4. Create State Tables

CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    location TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id TEXT,
    code TEXT NOT NULL,
    pin TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone_number TEXT,
    id_number TEXT,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id TEXT,
    title TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    category TEXT,
    timestamp BIGINT NOT NULL,
    status TEXT DEFAULT 'verified',
    image_url TEXT
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    category TEXT,
    frequency TEXT NOT NULL,
    next_run BIGINT NOT NULL,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS payment_requests (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    mpesa_code TEXT NOT NULL,
    payment_type TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
);

-- Index for unique business codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_code ON businesses(code);

-- ==========================================
-- 4. Row Level Security (Strict Isolation)
-- ==========================================
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

-- Dynamic Policy Generator
DO $$ 
BEGIN
    -- Branches
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their branches' AND tablename = 'branches') THEN
        CREATE POLICY "Users can access their branches" ON branches FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    -- Staff
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their staff' AND tablename = 'staff') THEN
        CREATE POLICY "Users can access their staff" ON staff FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    -- Expenses
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their expenses' AND tablename = 'expenses') THEN
        CREATE POLICY "Users can access their expenses" ON expenses FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    -- Recurring
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their recurring expenses' AND tablename = 'recurring_expenses') THEN
        CREATE POLICY "Users can access their recurring expenses" ON recurring_expenses FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    -- Payments
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their payment requests' AND tablename = 'payment_requests') THEN
        CREATE POLICY "Users can manage their payment requests" ON payment_requests FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;
END $$;

-- ==========================================
-- 5. Helper Functions (RPC)
-- ==========================================
CREATE OR REPLACE FUNCTION apply_stock_delta(
  p_product_id TEXT,
  p_business_id UUID,
  p_quantity_change INT
) RETURNS void 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products 
  SET quantity = quantity + p_quantity_change,
      updated_at = extract(epoch from now()) * 1000
  WHERE id = p_product_id AND business_id = p_business_id;

  -- The CHECK constraint will automatically revert this transaction if quantity < 0
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_server_timestamp() 
RETURNS BIGINT 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN extract(epoch from now()) * 1000;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION verify_staff_online(
  p_business_id UUID,
  p_code TEXT,
  p_pin TEXT
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_valid BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM staff 
    WHERE business_id = p_business_id 
      AND code = p_code 
      AND pin = p_pin 
      AND status = 'active'
  ) INTO v_is_valid;
  
  RETURN v_is_valid;
END;
$$ LANGUAGE plpgsql;

-- 8. Strict Production Hardening (RLS & Isolation)

-- Enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Multi-Tenant Isolation
CREATE POLICY "Strict Tenant Isolation (Businesses)" ON businesses FOR ALL USING (id::text = auth.uid()::text); 
CREATE POLICY "Strict Tenant Isolation (pos_events)" ON pos_events FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE id::text = auth.uid()::text));
CREATE POLICY "Strict Tenant Isolation (Sales)" ON sales FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE id::text = auth.uid()::text));

-- Prevent overwrite destruction on immutable financial tables for staff
REVOKE UPDATE, DELETE ON sales FROM authenticated;

-- Event-Driven Inventory Ledger
CREATE TABLE IF NOT EXISTS inventory_ledger (
    id TEXT PRIMARY KEY,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'ADD', 'SALE', 'REFUND', 'WASTE'
    quantity DECIMAL NOT NULL,
    recorded_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_ledger(product_id, business_id);
ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Strict Tenant Isolation (Inventory Ledger)" ON inventory_ledger FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE id::text = auth.uid()::text));
REVOKE UPDATE, DELETE ON inventory_ledger FROM authenticated;

-- Dead-Letter Queue (DLQ)
CREATE TABLE IF NOT EXISTS dlq (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    payload JSONB NOT NULL,
    error_message TEXT,
    failed_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE dlq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Strict Tenant Isolation (DLQ)" ON dlq FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE id::text = auth.uid()::text));
