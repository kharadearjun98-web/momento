import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('=== SUPABASE CLIENT INIT ===');
console.log('Supabase URL:', supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING');
console.log('Supabase Key:', supabaseAnonKey ? 'Present (' + supabaseAnonKey.length + ' chars)' : 'MISSING');

let supabase: SupabaseClient;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables! Using fallback.');
  // Create a mock client that will fail gracefully
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key', {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  });
  console.log('✅ Supabase client created successfully');
}

export { supabase };
