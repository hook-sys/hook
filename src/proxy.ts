import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // /auth/* only refreshes the session (it is not a protected prefix).
  matcher: ["/admin/:path*", "/auth/:path*"],
};
