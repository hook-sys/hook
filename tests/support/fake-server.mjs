// Test double for @/lib/supabase/server (avoids next/headers): same in-memory store as fake-admin.
import { createAdminClient } from "./fake-admin.mjs";
export async function createClient() {
  return createAdminClient();
}
