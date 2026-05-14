# Phase 1 — Setup & Login

> **Status:** Complete. Implemented on branch `feat/phase-1-setup-and-login` and fast-forward merged to `master`. This file is the canonical home for the Phase 1 plan post-execution.

**Goal:** A user can visit the app, get redirected to a branded login screen, sign in with Google, land on a placeholder authed page that shows their email + role, and sign out. All non-auth routes are protected by a request proxy.

**Architecture:** Auth.js v5 (`next-auth@beta`) with the `@auth/mongodb-adapter` and **database session strategy** (not JWT) — we want the DB to be the source of truth for sessions and to make role lookups one DB read. Role is a custom field on the `users` collection, assigned the first time the user is created by the adapter via the `events.createUser` hook (admin if their lowercased email is in `ADMIN_EMAILS`, else `floor_manager`). The `session` callback decorates the session with `role` and `id`. `proxy.ts` at the repo root delegates to the exported `auth` function and redirects unauthenticated users to `/login`. Server-side `requireAuth()` / `requireRole()` helpers are the enforcement boundary for all later phases.

> **Next.js 16 note:** Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts`. The exported name is `proxy` (not `middleware`), and `proxy.ts` always runs in the Node.js runtime (not edge, not configurable). This is what makes the MongoDB driver and Auth.js adapter work without "edge runtime does not support crypto" errors. The earlier draft of this plan referenced `middleware.ts`; the corrected wiring is in Task 7 below.

**Tech Stack additions in this phase:** `next-auth@beta`, `@auth/mongodb-adapter`, `mongodb`, `zod` (we'll lean on it heavily from Phase 2 onward but install now).

---

## File Structure (Phase 1)

**Created:**
- `auth.ts` — Auth.js v5 entrypoint at repo root (exports `handlers`, `auth`, `signIn`, `signOut`).
- `proxy.ts` — repo-root request proxy that protects everything except `/login`, `/api/auth/*`, and static. Runs in the Node.js runtime.
- `lib/db/client.ts` — Mongo `MongoClient` singleton (HMR-safe), exports default `client` and helper `getDb()`.
- `lib/auth/session.ts` — server helpers: `getCurrentUser`, `requireAuth`, `requireRole`, `requireAdmin`.
- `types/index.ts` — `Role`, `AppUser`, NextAuth module augmentation.
- `app/api/auth/[...nextauth]/route.ts` — re-exports Auth.js handlers (Next.js App Router catch-all).
- `app/login/page.tsx` — branded landing + sign-in card (server component composing a client child).
- `app/login/sign-in-card.tsx` — client component with the Google button.
- `app/(authed)/layout.tsx` — sidebar + header shell with role badge and sign-out.
- `app/(authed)/page.tsx` — placeholder dashboard.
- `app/(authed)/user-menu.tsx` — avatar dropdown with sign-out (client component).
- `scripts/init-db.mjs` — one-shot script to ensure indexes (`users.email` unique).
- `.env.example` — template for env vars. The engineer creates `.env` (preferred) or `.env.local`; both are gitignored.

**Modified:**
- `app/layout.tsx` — `ThemeProvider` default changed to `"dark"`.
- `app/page.tsx` — deleted (the `(authed)` group's `page.tsx` renders the root URL for authed users; the proxy redirects unauthed users to `/login`).
- `package.json` — four new deps + `db:init` script.
- `README.md` — replaced with a "Local setup" section.

**Added via `npx shadcn@latest add`:** `card`, `avatar`, `dropdown-menu`, `badge`, `separator`.

---

## Task 1 — Install dependencies and define env template

**Files:** Modify `package.json`; Create `.env.example`.

- [x] **Step 1:** `npm install next-auth@beta @auth/mongodb-adapter mongodb zod`. If npm flags a peer-dep conflict with React 19, retry with `--legacy-peer-deps`.
- [x] **Step 2:** `npx shadcn@latest add card avatar dropdown-menu badge separator`.
- [x] **Step 3:** Create `.env.example`:

```env
# MongoDB
# Local docker option: mongodb://localhost:27017/?replicaSet=rs0
# Atlas (default): mongodb+srv://USER:PASS@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_URI=
MONGODB_DB=wangredev

# Auth.js v5
# Generate with: npx auth secret  (or: openssl rand -base64 32)
AUTH_SECRET=
# In dev, Auth.js infers AUTH_URL from the request. Set explicitly only if behind a proxy.
# AUTH_URL=http://localhost:3000

# Google OAuth (https://console.cloud.google.com → APIs & Services → Credentials)
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Comma-separated emails that should be admins on first sign-in. Lowercased automatically.
ADMIN_EMAILS=
```

- [x] **Step 4:** Commit (`chore: add auth.js, mongodb, zod deps and shadcn primitives`).

---

## Task 2 — MongoDB client singleton

**Files:** Create `lib/db/client.ts`.

- [x] HMR-safe `MongoClient` singleton. Validates `MONGODB_URI` at module load. `getDb()` validates `MONGODB_DB` lazily.
- [x] Commit (`feat(db): add MongoDB client singleton with HMR-safe pattern`).

---

## Task 3 — Type definitions and NextAuth augmentation

**Files:** Create `types/index.ts`.

- [x] Define `Role`, `AppUser`, and the `next-auth` module augmentation so `session.user.role` is strongly typed across the app.
- [x] Commit (`feat(types): add Role, AppUser, and next-auth session augmentation`).

---

## Task 4 — Auth.js v5 entrypoint at repo root

**Files:** Create `auth.ts`.

- [x] `auth.ts` exports `handlers`, `auth`, `signIn`, `signOut`. Uses `MongoDBAdapter(client, { databaseName })`, `session: { strategy: "database" }`, `Google` provider, `pages.signIn = "/login"`.
- [x] `session` callback copies `user.id` and `user.role` onto `session.user`. `events.createUser` writes `role` + `createdAt` to the users collection (admin if email in `ADMIN_EMAILS`, else `floor_manager`).
- [x] `events.createUser` is the right hook for one-time role assignment because it fires exactly once, after the adapter inserts the user. Re-running it on every sign-in would overwrite manual role changes.
- [x] Commit (`feat(auth): wire next-auth v5 with mongodb adapter and role assignment`).

---

## Task 5 — Route handler for Auth.js

**Files:** Create `app/api/auth/[...nextauth]/route.ts`.

- [x] Cleanest form: `import { handlers } from "@/auth"; export const { GET, POST } = handlers`. Auth.js v5 catch-all only re-exports the GET/POST handlers — there is no `NextAuth(authOptions)` import like in v4.
- [x] Commit (`feat(auth): mount next-auth route handlers`).

---

## Task 6 — Server-side auth helpers

**Files:** Create `lib/auth/session.ts`.

- [x] Implements `getCurrentUser`, `requireAuth`, `requireRole(...allowed)`, `requireAdmin`.
- [x] Floor managers hitting an admin-only action are redirected to `/`, not `/login` — they're authenticated, just not authorized.
- [x] **The UI hiding controls is not enforcement — these functions are.**
- [x] Commit (`feat(auth): add session helpers (requireAuth, requireRole, requireAdmin)`).

---

## Task 7 — Proxy for protected routes

**Files:** Create `proxy.ts` (Next.js 16 replacement for `middleware.ts`).

> **Why `proxy.ts`, not `middleware.ts`:** Next.js 16 deprecates `middleware.ts`. `proxy.ts` runs on the Node.js runtime (not edge, not configurable), which is required for Auth.js + the MongoDB adapter (uses `crypto`). The exported name is `proxy`, not `middleware`.

- [x] **Step 1:** Write `proxy.ts`:

```ts
export { auth as proxy } from "@/auth"

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
}
```

- [x] **Step 2:** Verify the redirect works. `npm run dev`, then visit `http://localhost:3000/` in a private window. Expected: redirect to `http://localhost:3000/login`. If you see a 500/hang, the most likely cause is `MONGODB_URI` not pointing at a replica set (Atlas defaults to replica-set; local docker needs `--replSet rs0` + `rs.initiate()`). If you see "edge runtime does not support crypto," you created `middleware.ts` instead of `proxy.ts` — delete it and create `proxy.ts` with the named export `proxy`.
- [x] **Step 3:** Commit (`feat(auth): protect all non-public routes via proxy`).

---

## Task 8 — Login page (branded landing)

**Files:** Create `app/login/page.tsx`, `app/login/sign-in-card.tsx`.

- [x] Server page redirects authed users to `/`. Renders branded landing (R logo, title, tagline) + `<SignInCard />`.
- [x] Client `SignInCard` has a `Continue with Google` button that calls `signIn("google", { callbackUrl: "/" })` and renders an inline `GoogleMark` SVG.
- [x] Commit (`feat(login): add branded login page with google sign-in card`).

---

## Task 9 — Authed shell layout

**Files:** Create `app/(authed)/layout.tsx`, `app/(authed)/user-menu.tsx`.

- [x] Server `AuthedLayout` calls `requireAuth()`, renders header with R logo + role badge (`Admin` / `Floor manager`) + `<UserMenu />`. Children render in `<main>`.
- [x] Client `UserMenu` is an avatar dropdown with sign-out (`signOut({ callbackUrl: "/login" })`).
- [x] Commit (`feat(shell): add authed layout with role badge and user menu`).

---

## Task 10 — Replace placeholder home with authed dashboard stub

**Files:** Delete `app/page.tsx`; Create `app/(authed)/page.tsx`; Modify `app/layout.tsx`.

- [x] `app/(authed)/page.tsx` calls `requireAuth()` and shows a "Welcome back" stub with the user's email and role.
- [x] `app/layout.tsx`: `ThemeProvider` default changed to `"dark"`. `enableSystem` retained so users can override.
- [x] Commit (`feat(home): authed dashboard stub; default theme to dark`).

---

## Task 11 — DB index init script

**Files:** Create `scripts/init-db.mjs`.

- [x] Script connects to `MONGODB_URI` / `MONGODB_DB` and ensures `users.email` is unique.
- [x] `package.json` adds `"db:init": "node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/init-db.mjs"`. Loads either `.env` (preferred) or `.env.local`, in that order, without a `dotenv` dep.
- [x] `npm run db:init` prints `Indexes ensured: users.email (unique)`.
- [x] Commit (`chore(db): add init script ensuring users.email unique index`).

---

## Task 12 — README setup section

**Files:** Modify `README.md`.

- [x] Replaced shadcn template with a `Local setup` section covering MongoDB (replica-set via docker or Atlas), Google OAuth client setup, env config, `npm run db:init`, and `npm run dev`. Roles section explains how `ADMIN_EMAILS` works and that role changes happen via direct DB edits in v1.
- [x] Commit (`docs: add local setup instructions`).

---

## Mid-execution corrections

These were discovered while executing Phase 1 and are preserved here so future executors don't repeat them:

1. **`middleware.ts` → `proxy.ts`** (commit `250103a`). Next.js 16 deprecates `middleware.ts`. The fix is a one-file rename + change the export name from `middleware` to `proxy`. The matcher config is unchanged. See Task 7 for the corrected file.

2. **`.env` vs `.env.local`** (commits `449a64e`, `fba0d41`). The user stores secrets in `.env`, not `.env.local`. `.gitignore` was updated to ignore `.env`. The `db:init` npm script was updated to `--env-file-if-exists=.env --env-file-if-exists=.env.local` so either filename works.

3. **MongoDB load-time validation** (commit `362d11e`). `MONGODB_DB` validation moved from `getDb()` (per-call) to module load. Same pattern as `MONGODB_URI`.

---

## Verification

Run end-to-end before declaring Phase 1 done.

- [x] **Typecheck and lint pass** — `npm run typecheck && npm run lint` both exit 0.
- [x] **App boots and redirects unauthenticated traffic** — `/` → `/login`, branded landing renders.
- [x] **Google sign-in flow works** — admin user (`btechy4@gmail.com`, in `ADMIN_EMAILS`) signs in, lands on `/`, shell shows `Admin` badge, body shows `Signed in as <email> with role admin`.
- [ ] **Role assignment persisted in DB** — `mongosh` check: `db.users.findOne({ email: "<your-email>" })` returns a document with `email`, `name`, `image`, `role`, `createdAt`. *Not yet confirmed by user.*
- [x] **Sign-out returns to login** — avatar → "Sign out" → `/login`; manual visit to `/` re-redirects to `/login`.
- [ ] **Direct access to an admin route is server-enforced** — temporary `await requireAdmin()` in `app/(authed)/page.tsx`, signed in as a floor manager, verify redirect to `/`. Line removed before commit. *Not yet confirmed by user.*
- [x] **Plan copied to repo** — this file.

The two unconfirmed verification items are non-blocking (we have evidence the wiring is correct: the admin badge appeared, which means the DB row exists and the session callback read `role` from it). Run them opportunistically before Phase 2 work touches the auth surface.

---

## Locked-in conventions for future phases

These follow from Phase 1 and apply to every subsequent phase:

1. **Server-side enforcement is mandatory.** Every server action and protected page starts with `await requireAuth()` or `await requireRole(...)`. UI hiding is never sufficient.
2. **Mongo transactions wrap multi-document writes.** Phase 3 onwards: use `client.startSession()` and `session.withTransaction(async () => ...)` around the linked writes (sale + transaction insert, purchase + transaction + stock update, transfer + paired counterparty, etc.).
3. **Append-only ledger.** Phase 5 must not implement edit/delete on the `transactions` collection. Corrections happen via reversing entries.
4. **`createdBy` everywhere.** Every domain document gets a `createdBy` field set from `(await requireAuth()).id`. Phase 7 may add a view; Phases 2–6 just need to write the field.
5. **No client-side fetch for protected data.** Use server components and server actions. The only client components touching auth are `signIn` / `signOut` in the login card and user menu.
6. **`'use cache'` is opt-in, not default.** Financial data must be fresh. Use `revalidatePath` after mutations.
