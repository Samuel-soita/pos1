-- ==========================================
-- Supabase Schema for Offline-First POS (Updated)
-- Copy and paste this into your Supabase SQL Editor
-- ==========================================

-- 1. Update Existing Tables
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS package_id TEXT;

-- 2. Create New Tables
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    pin TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone_number TEXT,
    id_number TEXT,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    category TEXT,
    timestamp BIGINT NOT NULL,
    is_recurring BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
    id UUID PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    amount DECIMAL NOT NULL,
    category TEXT,
    frequency TEXT NOT NULL,
    next_run BIGINT NOT NULL,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    mpesa_code TEXT NOT NULL,
    payment_type TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
);

-- ==========================================
-- 3. Row Level Security (Data Isolation)
-- ==========================================
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

-- Security Policies for New Tables
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their staff' AND tablename = 'staff') THEN
        CREATE POLICY "Users can access their staff" ON staff FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their expenses' AND tablename = 'expenses') THEN
        CREATE POLICY "Users can access their expenses" ON expenses FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their recurring expenses' AND tablename = 'recurring_expenses') THEN
        CREATE POLICY "Users can access their recurring expenses" ON recurring_expenses FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their payment requests' AND tablename = 'payment_requests') THEN
        CREATE POLICY "Users can manage their payment requests" ON payment_requests FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;
END $$;

-- ==========================================
-- 4. Stock Delta Merge Function (RPC)
-- ==========================================
CREATE OR REPLACE FUNCTION apply_stock_delta(
  p_product_id UUID,
  p_business_id UUID,
  p_quantity_change INT
) RETURNS void 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != p_business_id THEN
    RAISE EXCEPTION 'Unauthorized stock manipulation';
  END IF;

  UPDATE products 
  SET quantity = quantity + p_quantity_change,
      updated_at = extract(epoch from now()) * 1000
  WHERE id = p_product_id AND business_id = p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 5. Server Time Function (RPC)
-- ==========================================
CREATE OR REPLACE FUNCTION get_server_timestamp() 
RETURNS BIGINT 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN extract(epoch from now()) * 1000;
END;
$$ LANGUAGE plpgsql;
