-- Supabase Schema for Offline-First POS (Premium Multi-Tenant Edition)
-- ==========================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- ==========================================

-- 1. Hardening Existing Tables
-- First, drop dependent views to allow column type alterations
DROP VIEW IF EXISTS admin_business_management;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pin TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS package_id TEXT DEFAULT 'hustler';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE businesses ALTER COLUMN expiry_date TYPE BIGINT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'sole_proprietor';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS staff_count INT DEFAULT 5;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS custom_feature_count INT DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS enabled_features TEXT[];
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS suspended_revenue_count INT DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS kra_pin TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS staff_permissions JSONB DEFAULT '{"inventory": true, "expenses": true, "reports": false, "staff": false, "settings": false, "suppliers": false, "purchases": false}';

-- 1.5 Payment Requests Migration
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS checkout_request_id TEXT;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS sale_id UUID;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS mpesa_fee DECIMAL DEFAULT 0;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS mpesa_code TEXT;
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS payment_type TEXT;
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_requests_checkout_request_id_key') THEN
        ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_checkout_request_id_key UNIQUE (checkout_request_id);
    END IF;
END $$;


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
    event_id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    staff_id TEXT,
    event_type TEXT NOT NULL,      -- 'sale_created', 'stock_reserved', 'stock_committed'
    payload JSONB NOT NULL,
    client_timestamp BIGINT NOT NULL,
    server_timestamp BIGINT DEFAULT (extract(epoch from now()) * 1000)::bigint,
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

-- 4.5 NEW: Sales Table (Materialized transactions)
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id TEXT,
    staff_id TEXT,
    total DECIMAL NOT NULL DEFAULT 0,
    total_profit DECIMAL NOT NULL DEFAULT 0,
    timestamp BIGINT NOT NULL,
    receipt_id TEXT,
    items JSONB NOT NULL DEFAULT '[]',
    tax_rate DECIMAL DEFAULT 0,
    tax_amount DECIMAL DEFAULT 0,
    payment_method TEXT,
    split_payments JSONB DEFAULT '[]',
    transaction_code TEXT,
    device_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4.6 NEW: Shifts Table (Staff accounting)
CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    staff_id TEXT,
    branch_id TEXT,
    start_time BIGINT NOT NULL,
    end_time BIGINT,
    total_sales DECIMAL DEFAULT 0,
    cash_sales DECIMAL DEFAULT 0,
    mpesa_sales DECIMAL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4.7 NEW: Cash Logs (Register audit)
CREATE TABLE IF NOT EXISTS cash_logs (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    staff_id TEXT,
    branch_id TEXT,
    date TEXT NOT NULL, -- YYYY-MM-DD
    opening_float DECIMAL NOT NULL DEFAULT 0,
    expected_closing DECIMAL DEFAULT 0,
    actual_closing DECIMAL,
    discrepancy DECIMAL,
    timestamp BIGINT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4.8 NEW: Snapshots (For fast state recovery)
CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    view_type TEXT NOT NULL, -- 'stock', 'sales', 'cash'
    state JSONB NOT NULL,
    last_applied_event TEXT,
    updated_at BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(business_id, view_type)
);

-- 4.9 NEW: Settings (Global configuration)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (business_id, key)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    kra_pin TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4.10 NEW: Purchases (Inventory Sourcing)
CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id TEXT,
    supplier_id TEXT REFERENCES suppliers(id),
    total DECIMAL NOT NULL DEFAULT 0,
    timestamp BIGINT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    payment_status TEXT DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending', 'partial')),
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
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'manager', 'admin', 'owner')),
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

-- 4. Payment Integrations & Fees (Universal Hub Mode)
CREATE TABLE IF NOT EXISTS business_mpesa_configs (
    business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
    payout_destination TEXT,         -- Merchant's Payout Phone/Till/Paybill
    convenience_fee DECIMAL DEFAULT 0, -- Fee added to customer total
    is_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Upgraded payment_requests for Sales support
CREATE TABLE IF NOT EXISTS payment_requests (
    id TEXT PRIMARY KEY,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    sale_id UUID,                   -- Optional: Link to a specific sale
    checkout_request_id TEXT UNIQUE, -- M-Pesa reference
    phone_number TEXT,
    amount DECIMAL DEFAULT 0,
    mpesa_fee DECIMAL DEFAULT 0,    -- Tracking the convenience fee
    mpesa_code TEXT,                -- Filled after success
    payment_type TEXT NOT NULL,     -- 'activation', 'renewal', 'sale'
    target_package TEXT,            -- NEW: For package upgrades
    timestamp BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', 'failed'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log for raw M-Pesa data
CREATE TABLE IF NOT EXISTS mpesa_raw_callbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_request_id TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on audit tables
ALTER TABLE mpesa_raw_callbacks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only for raw callbacks" ON mpesa_raw_callbacks;
-- Restrict to service_role or a specific adminUID if needed. For now, we block all public access.
CREATE POLICY "Service role only for raw callbacks" ON mpesa_raw_callbacks 
FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- Index for unique business codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_code ON businesses(code);
CREATE INDEX IF NOT EXISTS idx_payment_requests_lookup ON payment_requests(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_staff_lookup ON staff(business_id, code);

-- ==========================================
-- 4. Row Level Security (Strict Isolation)
-- ==========================================
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

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

    -- Shifts
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their shifts' AND tablename = 'shifts') THEN
        CREATE POLICY "Users can access their shifts" ON shifts FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    -- Cash Logs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their cash_logs' AND tablename = 'cash_logs') THEN
        CREATE POLICY "Users can access their cash_logs" ON cash_logs FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    -- Snapshots
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their snapshots' AND tablename = 'snapshots') THEN
        CREATE POLICY "Users can access their snapshots" ON snapshots FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    -- Settings
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their settings' AND tablename = 'settings') THEN
        CREATE POLICY "Users can access their settings" ON settings FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
    END IF;

    -- Suppliers
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can access their suppliers' AND tablename = 'suppliers') THEN
        CREATE POLICY "Users can access their suppliers" ON suppliers FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
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
ALTER TABLE business_mpesa_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

-- Multi-Tenant Isolation (Idempotent cleanup)
DROP POLICY IF EXISTS "Strict Tenant Isolation (Businesses)" ON businesses;
DROP POLICY IF EXISTS "Strict Tenant Isolation (pos_events)" ON pos_events;
DROP POLICY IF EXISTS "Strict Tenant Isolation (Sales)" ON sales;
DROP POLICY IF EXISTS "Strict Tenant Isolation (Products)" ON products;
DROP POLICY IF EXISTS "Strict Tenant Isolation (Expenses)" ON expenses;
DROP POLICY IF EXISTS "Strict Tenant Isolation (Shifts)" ON shifts;
DROP POLICY IF EXISTS "Strict Tenant Isolation (Cash Logs)" ON cash_logs;
DROP POLICY IF EXISTS "Strict Tenant Isolation (Snapshots)" ON snapshots;
DROP POLICY IF EXISTS "Strict Tenant Isolation (Settings)" ON settings;
DROP POLICY IF EXISTS "Strict Tenant Isolation (Businesses)" ON businesses;
CREATE POLICY "Strict Tenant Isolation (Businesses)" ON businesses FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid()); 

DROP POLICY IF EXISTS "Strict Tenant Isolation (pos_events)" ON pos_events;
CREATE POLICY "Strict Tenant Isolation (pos_events)" ON pos_events FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "Strict Tenant Isolation (Sales)" ON sales;
CREATE POLICY "Strict Tenant Isolation (Sales)" ON sales FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "Strict Tenant Isolation (Products)" ON products;
CREATE POLICY "Strict Tenant Isolation (Products)" ON products FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "Strict Tenant Isolation (Expenses)" ON expenses;
CREATE POLICY "Strict Tenant Isolation (Expenses)" ON expenses FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "Strict Tenant Isolation (Settings)" ON settings;
CREATE POLICY "Strict Tenant Isolation (Settings)" ON settings FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "Strict Tenant Isolation (Purchases)" ON purchases;
CREATE POLICY "Strict Tenant Isolation (Purchases)" ON purchases FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "Strict Tenant Isolation (Suppliers)" ON suppliers;
CREATE POLICY "Strict Tenant Isolation (Suppliers)" ON suppliers FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());

-- Prevent overwrite destruction on immutable financial tables for staff
REVOKE UPDATE, DELETE ON sales FROM authenticated;

-- Prevent Business Subscription Tampering
CREATE OR REPLACE FUNCTION prevent_subscription_tampering()
RETURNS trigger AS $$
BEGIN
    IF NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.package_id IS DISTINCT FROM OLD.package_id
    OR NEW.trial_used IS DISTINCT FROM OLD.trial_used
    OR NEW.suspended_revenue_count IS DISTINCT FROM OLD.suspended_revenue_count THEN
        IF current_setting('request.jwt.claim.role', true) = 'authenticated' THEN
            RAISE EXCEPTION 'Unauthorized subscription modification';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_business_subscription ON businesses;
CREATE TRIGGER protect_business_subscription
BEFORE UPDATE ON businesses
FOR EACH ROW
EXECUTE FUNCTION prevent_subscription_tampering();

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
DROP POLICY IF EXISTS "Strict Tenant Isolation (Inventory Ledger)" ON inventory_ledger;
CREATE POLICY "Strict Tenant Isolation (Inventory Ledger)" ON inventory_ledger FOR ALL USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());
-- Idempotent sync requires update/select
GRANT ALL ON pos_events TO authenticated;
GRANT ALL ON business_mpesa_configs TO authenticated;

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
DROP POLICY IF EXISTS "Strict Tenant Isolation (DLQ)" ON dlq;
CREATE POLICY "Strict Tenant Isolation (DLQ)" ON dlq FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE id::text = auth.uid()::text));
-- 9. Automatic Activation Logic
CREATE OR REPLACE FUNCTION handle_payment_success()
RETURNS TRIGGER AS $$
DECLARE
    v_event_id TEXT;
    v_now_ms BIGINT;
BEGIN
    IF NEW.status = 'success' AND (OLD.status = 'pending' OR OLD.status IS NULL) THEN
        v_now_ms := (extract(epoch from now()) * 1000)::bigint;
        v_event_id := 'SYS-ACT-' || substring(gen_random_uuid()::text, 1, 8);

        -- 1. Activate the business
        UPDATE businesses
        SET status = 'active',
            package_id = COALESCE(NEW.target_package, package_id),
            expiry_date = CASE 
                WHEN expiry_date > v_now_ms 
                THEN expiry_date + (30 * 24 * 60 * 60 * 1000) -- Add 30 days to existing
                ELSE v_now_ms + (30 * 24 * 60 * 60 * 1000) -- Add 30 days from now
            END
        WHERE id = NEW.business_id;

        -- 2. Emit a POS_EVENT so the offline clients sync this change properly
        INSERT INTO pos_events (
            event_id,
            business_id,
            staff_id,
            event_type,
            payload,
            client_timestamp,
            hash
        ) VALUES (
            v_event_id,
            NEW.business_id,
            'SYSTEM',
            'BUSINESS_UPDATED',
            jsonb_build_object(
                'id', NEW.business_id,
                'status', 'active',
                'payout_destination', NEW.phone_number,
                'last_payment_ref', NEW.checkout_request_id
            ),
            v_now_ms,
            'SERVER_SIGNED'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_payment_success ON payment_requests;
CREATE TRIGGER on_payment_success
    AFTER UPDATE ON payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION handle_payment_success();

-- 10. Automatic Identity Sync (Auth -> Public)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.businesses (id, name, code, status, package_id, expiry_date, pin, owner_email, staff_permissions)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'business_name', 'My Business'), 
    COALESCE(new.raw_user_meta_data->>'business_code', 'BIZ-' || substring(new.id::text, 1, 5)),
    'active',
    'hustler',
    (extract(epoch from now()) * 1000)::bigint + (30::bigint * 24 * 60 * 60 * 1000),
    '0000',
    new.email,
    '{"inventory": true, "expenses": true, "reports": false, "staff": false, "settings": false, "suppliers": false, "purchases": false}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 11. Realtime Publication
-- ==========================================
-- This enables the frontend to subscribe to instant updates (e.g. M-Pesa results)
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE 
    payment_requests, 
    pos_events, 
    businesses,
    sales,
    shifts,
    cash_logs;
COMMIT;

-- ==========================================
-- 12. Hardened Provisioning & Audit Registry
-- ==========================================

-- 1. Activation Tokens Table
CREATE TABLE IF NOT EXISTS public.activation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    max_uses INT DEFAULT 1,
    current_uses INT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true
);

-- Enable RLS on tokens
ALTER TABLE public.activation_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only for tokens" ON public.activation_tokens;
CREATE POLICY "Service role only for tokens" ON public.activation_tokens 
FOR ALL USING (current_setting('request.jwt.claim.role', true) = 'service_role');

-- 2. Provisioning Audit Log
-- FIX: Grant INSERT to 'anon' so engineers can log setup before owner is created.
CREATE TABLE IF NOT EXISTS public.provisioning_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID REFERENCES public.activation_tokens(id),
    business_id UUID, 
    business_code TEXT, -- Explicit registry column for lookup
    engineer_id TEXT, 
    device_metadata JSONB,
    provisioned_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.provisioning_audit ADD COLUMN IF NOT EXISTS business_code TEXT;

ALTER TABLE public.provisioning_audit ENABLE ROW LEVEL SECURITY;
GRANT INSERT ON public.provisioning_audit TO anon, authenticated;

DROP POLICY IF EXISTS "allow_anon_audit_insert" ON public.provisioning_audit;
CREATE POLICY "allow_anon_audit_insert" ON public.provisioning_audit
    FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 3. Sequential Counters System
CREATE TABLE IF NOT EXISTS public.system_counters (
    id TEXT PRIMARY KEY, -- 'business_code' or 'staff_code_BUSINESSID'
    last_value INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_counters ENABLE ROW LEVEL SECURITY;
-- By leaving it with no policies, we restrict ALL direct access via API (Only RPCs with SECURITY DEFINER can read/write)


-- RPC: Secure NanoID Business Code (e.g., A7K-9P2)
CREATE OR REPLACE FUNCTION get_secure_business_code()
RETURNS TEXT AS $$
DECLARE
    new_code TEXT;
    is_unique BOOLEAN := FALSE;
BEGIN
    WHILE NOT is_unique LOOP
        new_code := upper(substring(md5(random()::text), 1, 3) || '-' || substring(md5(random()::text), 4, 3));
        
        -- In a multi-tenant system, this code must be globally unique
        SELECT NOT EXISTS(SELECT 1 FROM public.businesses WHERE code = new_code) INTO is_unique;
    END LOOP;

    RETURN new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Padded Staff Code per Business (001+)
CREATE OR REPLACE FUNCTION get_next_staff_code(p_business_id UUID)
RETURNS TEXT AS $$
DECLARE
    counter_id TEXT;
    next_val INTEGER;
BEGIN
    counter_id := 'staff_code_' || p_business_id::text;
    
    INSERT INTO public.system_counters (id, last_value)
    VALUES (counter_id, 1)
    ON CONFLICT (id) DO UPDATE 
    SET last_value = system_counters.last_value + 1,
        updated_at = now()
    RETURNING last_value INTO next_val;

    RETURN lpad(next_val::text, 3, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Secure Validation Logic
CREATE OR REPLACE FUNCTION validate_provisioning_token(p_token TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_token_id UUID;
BEGIN
    SELECT id INTO v_token_id
    FROM public.activation_tokens 
    WHERE token_hash = crypt(p_token, token_hash) 
    AND is_active = true 
    AND expires_at > now()
    AND current_uses < max_uses
    FOR UPDATE;

    IF v_token_id IS NOT NULL THEN
        UPDATE public.activation_tokens 
        SET current_uses = current_uses + 1 
        WHERE id = v_token_id;
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Business Code Resolver (Enables Email-less Login)
CREATE OR REPLACE FUNCTION resolve_business_email(p_code TEXT)
RETURNS TEXT AS $$
DECLARE
    v_email TEXT;
BEGIN
    SELECT owner_email INTO v_email
    FROM public.businesses
    WHERE code = p_code
    LIMIT 1;

    RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION resolve_business_email(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION validate_provisioning_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_secure_business_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_next_staff_code(UUID) TO authenticated;

-- Ensure system_counters is NOT directly accessible
REVOKE ALL ON public.system_counters FROM authenticated;
REVOKE ALL ON public.system_counters FROM anon;

GRANT ALL ON public.provisioning_audit TO authenticated;

GRANT ALL ON public.purchases TO authenticated;

-- ==========================================
-- 13. Admin Management Views
-- ==========================================
-- Provides a clean table inside Supabase to easily see Business Names, IDs, and human-readable expiry dates
CREATE OR REPLACE VIEW admin_business_management AS
SELECT 
    id as business_id,
    name as business_name,
    code as business_code,
    owner_email,
    telephone,
    status,
    package_id,
    staff_count,
    to_timestamp(expiry_date / 1000.0) as expiry_date_human_readable,
    suspended_revenue_count,
    created_at
FROM public.businesses
ORDER BY created_at DESC;

-- 3. Manual Activation Helper for Corporate Engineer
-- Use this from the SQL Editor: SELECT activate_business_manually('0001', 30);
CREATE OR REPLACE FUNCTION activate_business_manually(p_business_code TEXT, p_days INT DEFAULT 30)
RETURNS TEXT AS $$
DECLARE
    v_business_id UUID;
    v_new_expiry BIGINT;
BEGIN
    -- Find the business ID by the 4-digit code
    SELECT id INTO v_business_id FROM businesses WHERE code = p_business_code;
    
    IF v_business_id IS NULL THEN
        RETURN 'Error: Business code ' || p_business_code || ' not found.';
    END IF;
    
    -- Calculate new expiry (Current time in ms + days * 86,400,000 ms)
    v_new_expiry := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT + (p_days::BIGINT * 86400000);
    
    UPDATE businesses
    SET 
        status = 'active',
        expiry_date = v_new_expiry,
        suspended_revenue_count = 0
    WHERE id = v_business_id;
    
    RETURN 'Success: Business ' || p_business_code || ' (' || v_business_id || ') activated for ' || p_days || ' days. New expiry: ' || to_timestamp(v_new_expiry / 1000.0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
