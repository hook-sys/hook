"use client";

import { useEffect } from "react";

// Supabase falls back to the project's Site URL (the landing page) when an email link has
// no allowed redirect. Forward such links to the right handler:
// - ?code=...                          -> /auth/callback (PKCE, exchanged server-side)
// - #access_token=... / #error_code=... -> /auth/reset-password (tokens stay in the fragment,
//   which is never sent to the server; query-string tokens are moved into the fragment).
export function AuthLinkForwarder() {
  useEffect(() => {
    const { hash, search } = window.location;
    const query = new URLSearchParams(search);
    const fragment = new URLSearchParams(hash.replace(/^#/, ""));

    if (query.get("code")) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(query.get("code")!)}&next=/auth/reset-password`);
      return;
    }
    const tokens = fragment.get("access_token") || fragment.get("error_code") ? fragment : query.get("access_token") || query.get("error_code") ? query : null;
    if (tokens) window.location.replace(`/auth/reset-password#${tokens.toString()}`);
  }, []);
  return null;
}
