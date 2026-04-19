import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co').trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_key').trim();

export const supabase = createClient(supabaseUrl, supabaseKey);
