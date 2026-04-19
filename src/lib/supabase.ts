import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co').trim();
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_key';
const supabaseKey = rawKey.replace(/%0A/g, '').replace(/%0D/g, '').replace(/[\n\r]+/g, '').trim();

export const supabase = createClient(supabaseUrl, supabaseKey);
