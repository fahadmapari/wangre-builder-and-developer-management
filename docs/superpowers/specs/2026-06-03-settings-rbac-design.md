# Settings Page & Role-Based Access Control

**Date:** 2026-06-03  
**Status:** Approved

## Overview

Add an admin-only `/settings` page with two capabilities:

1. **Access List** — manage an `allowedEmails` MongoDB collection that acts as the whitelist for who may sign in, pre-configured with a role before first sign-in.
2. **Users** — manage the roles and presence of users who have already signed in.

Sign-in becomes gated: only emails present in `allowedEmails` can authenticate. Removing an email immediately blocks that user by deleting their sessions.

---

## Data Model

### New collection: `allowedEmails`

```ts
{
  _id: ObjectId,
  email: string,        // lowercased, trimmed — unique index
  role: "admin" | "floor_manager",
  addedAt: Date,
  addedBy: ObjectId     // userId of the admin who added it
}
```

- Single source of truth for who may sign in.
- The `role` field seeds the user's role at first sign-in.
- After sign-in, the live role is stored in the `users` collection and can be changed independently.
- Removing an entry from `allowedEmails` prevents future sign-ins for that email.

### Existing collection: `users` (NextAuth-managed)

No schema changes. Continues to store the live `role` field that controls runtime permissions.

---

## Auth Changes (`auth.ts`)

### 1. Sign-in gate

The `signIn` callback queries `allowedEmails` for the email attempting to sign in. If no matching entry exists, NextAuth rejects the sign-in and redirects to `/login?error=NotAllowed`. The login page displays a human-readable message for the `NotAllowed` error code.

### 2. Role seeding on first sign-in

The `createUser` event reads the matching `allowedEmails` entry and writes that role to the new user document. This replaces the current `ADMIN_EMAILS` env var logic entirely.

### 3. Bootstrap mechanism

On a fresh install, `allowedEmails` is empty and no one can sign in. To avoid a lockout:

- If `ADMIN_EMAILS` is set in the environment **and** the `allowedEmails` collection is empty, the sign-in callback inserts those emails as `admin` entries (lazily, on first sign-in attempt).
- Once the collection is populated, `ADMIN_EMAILS` has no further effect.
- The env var is retained solely as a one-time bootstrap tool; it is not used for ongoing access control.

### 4. Migration for existing users

When this feature is deployed to an existing installation that already has users in the `users` collection, those users would be immediately locked out (their email is not in `allowedEmails`). To prevent this:

- On startup (or on the first sign-in attempt that triggers the bootstrap check), if `allowedEmails` is empty, seed it from **all existing user documents** using each user's current `role`.
- This migration runs once: it is a no-op if `allowedEmails` is already populated.
- Result: all existing users are grandfathered in with their current roles, and the admin can then remove or adjust them via the settings page.

---

## Settings Page

### Route & access

`/settings` — server component, protected by `requireAdmin()`. Admin-only nav link added to the navbar between "Audit" and the right-side user menu.

### Tab 1: Access List

Manages the `allowedEmails` collection.

| Column | Notes |
|--------|-------|
| Email | Lowercased |
| Role | Admin / Floor Manager badge |
| Added By | Name of admin who added entry |
| Added At | Date |
| Actions | Remove button |

- **Add Email** button opens a dialog: email input + role select → `addAllowedEmail` server action → row appears.
- **Remove** → `removeAllowedEmail` server action:
  - Deletes entry from `allowedEmails`.
  - Deletes all documents from the `sessions` collection for that user (immediate block).

### Tab 2: Users

Manages the `users` collection for accounts that have already signed in.

| Column | Notes |
|--------|-------|
| Name | From Google profile |
| Email | |
| Role | Inline select (Admin / Floor Manager) |
| Actions | Remove button |

- **Change role** → `updateUserRole` server action:
  - Updates `users.role`.
  - Also updates the matching `allowedEmails.role` entry if one exists (keeps the two in sync).
- **Remove** → `removeUser` server action (hard delete — no soft-delete):
  - Deletes user document from `users` collection.
  - Deletes all their session documents (immediate block).
  - Deletes their `allowedEmails` entry if present.

---

## Server Actions (`app/(authed)/settings/actions.ts`)

| Action | Input | Effect |
|--------|-------|--------|
| `addAllowedEmail` | `email, role` | Upserts entry in `allowedEmails` |
| `removeAllowedEmail` | `email` | Deletes from `allowedEmails`, deletes sessions for that email |
| `updateUserRole` | `userId, role` | Updates `users.role`, updates `allowedEmails.role` if entry exists |
| `removeUser` | `userId` | Deletes user, sessions, and `allowedEmails` entry |

All actions are guarded server-side with `requireAdmin()`.

---

## File Layout

```
app/(authed)/settings/
├── page.tsx          # server component — requireAdmin(), fetches initial data
├── actions.ts        # server actions
└── components.tsx    # client components (tables, dialogs, role selects)

lib/settings/
├── repository.ts     # DB operations (allowedEmails + users + sessions)
└── schemas.ts        # AllowedEmail type + Zod validators
```

---

## Error Handling

- `addAllowedEmail` with a duplicate email → upsert (update role in place, no error).
- `removeAllowedEmail` for an email with no user account (pre-registered only) → only deletes the `allowedEmails` entry; sessions deletion is a no-op.
- Invalid email format → rejected by Zod validation before any DB write.
- Removing yourself as admin → disallowed server-side (action checks `session.user.email !== email`).

---

## Out of Scope

- Audit logging of settings changes (can be added in a later phase).
- Bulk import of emails.
- Invitation emails.
