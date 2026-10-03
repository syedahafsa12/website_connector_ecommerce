import { createClient } from "@supabase/supabase-js";

// Supabase is used here ONLY for Auth (signup/login/session verification).
// All data access still goes through `pg` (src/server/db/pool.ts), per the
// existing project convention — see .env.example.
let client: ReturnType<typeof createClient> | undefined;

export function getSupabaseAuthClient() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
    }
    client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
