import { createClient } from "@supabase/supabase-js";

// Same project and same auth storage key as the previous (plain HTML) version, so
// existing logins and all existing data keep working without any migration.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://xflbjraordcyobcqkuya.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable__QK5_4ghjAOSf56BTIm_dA_jUemvs9U";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "moneta-auth"
  }
});
