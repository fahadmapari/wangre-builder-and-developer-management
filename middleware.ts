export { auth as middleware } from "@/auth"

export const config = {
  // Run middleware on everything except: the login page, auth API routes,
  // static assets, and the favicon. Auth.js will redirect unauthenticated
  // requests to `pages.signIn` ("/login") automatically.
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
}
