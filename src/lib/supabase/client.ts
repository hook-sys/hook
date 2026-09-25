import { createBrowserClient } from "@supabase/ssr";

// Browser client, used only to turn a recovery link's URL-fragment tokens into the
// cookie session the server reads. Automatic URL detection is off: the recovery page
// handles (and immediately strips) the tokens itself.
export function createBrowserSupabaseClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { detectSessionInUrl: false },
  });
}
