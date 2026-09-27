import { createClient } from '@supabase/supabase-js'

// Tidy the values in case they were pasted with spaces or with /rest/v1 on the end
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '')
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them in Vercel under Settings, Environment Variables.')
}

export const supabase = createClient(url || 'https://missing.supabase.co', key || 'missing')
