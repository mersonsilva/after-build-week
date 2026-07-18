import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "../config/supabase.js";

let clientPromise;

export async function getSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase ainda não foi configurado.");
  }

  if (!clientPromise) {
    const isAdmin = window.location.pathname === "/admin" || window.location.pathname === "/admin/";
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: isAdmin ? "after.admin.auth" : "after.app.auth"
        }
      })
    );
  }

  return clientPromise;
}



