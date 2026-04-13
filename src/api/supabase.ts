import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

function getStorageKey(): string {
  const urlMatch = supabaseUrl?.match(/\/\/([^.]+)\./)
  return urlMatch ? `sb-${urlMatch[1]}-auth-token` : 'sb-auth-token'
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storageKey: getStorageKey(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
)
