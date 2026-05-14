export { auth as proxy } from "@/auth"

export const config = {
  // Run on everything except: the login page, auth API routes, static assets,
  // and the favicon. Auth.js will redirect unauthenticated requests to
  // `pages.signIn` ("/login") automatically. Next.js 16 runs `proxy.ts` in the
  // Node.js runtime, which is required for Auth.js + MongoDB adapter (crypto).
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
}
