import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PROTECTED_PREFIX = "/admin";
const LOGIN_PATH = "/admin/login";
// Routes that must never exist (return 404) rather than redirect to login.
const DISABLED_ROUTES = new Set(["/admin/signup"]);

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (DISABLED_ROUTES.has(pathname)) {
    return response;
  }

  const isProtected =
    pathname.startsWith(PROTECTED_PREFIX) && pathname !== LOGIN_PATH;

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === LOGIN_PATH && user) {
    const { data: profile } = await supabase
      .from("admin_users")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Session belongs to a deactivated or non-staff account: clear it so the
    // login page renders instead of bouncing back to /admin in a loop.
    await supabase.auth.signOut();
    return response;
  }

  return response;
}
