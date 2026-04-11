-- ==========================================
-- SMUTA PAY: Hardened Provisioning Schema (v2)
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

-- 2. Provisioning Audit Log
-- FIX: Grant INSERT to 'anon' so engineers can log setup before owner is created.
CREATE TABLE IF NOT EXISTS public.provisioning_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id UUID REFERENCES public.activation_tokens(id),
    business_id UUID, 
    engineer_id TEXT, 
    device_metadata JSONB,
    provisioned_at TIMESTAMPTZ DEFAULT now()
);

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

GRANT EXECUTE ON FUNCTION validate_provisioning_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_secure_business_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_next_staff_code(UUID) TO authenticated;

-- 5. Final Permission Hardening (Aligned with actual schema)
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.sales TO authenticated;
GRANT ALL ON public.inventory_ledger TO authenticated;
GRANT ALL ON public.expenses TO authenticated;
GRANT ALL ON public.recurring_expenses TO authenticated;
GRANT ALL ON public.payment_requests TO authenticated;
GRANT ALL ON public.staff TO authenticated;
GRANT ALL ON public.branches TO authenticated;
GRANT ALL ON public.dlq TO authenticated;
GRANT ALL ON public.businesses TO authenticated;
GRANT ALL ON public.system_counters TO authenticated;
