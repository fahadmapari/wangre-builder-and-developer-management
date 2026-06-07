# JV Tag on Project Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an indigo "JV" badge next to the project name on project cards when `isJointVenture` is `true`.

**Architecture:** Single UI-only change in the server-rendered projects list page. The `isJointVenture` field already exists on the `Project` type and is returned by `listProjects()`. No data-layer changes needed.

**Tech Stack:** Next.js (App Router, server component), React, Tailwind CSS, shadcn/ui `Badge`

---

### Task 1: Add JV badge to project card

**Files:**
- Modify: `app/(authed)/projects/page.tsx`

- [ ] **Step 1: Open the file and locate the card header row**

Open `app/(authed)/projects/page.tsx`. Find this block (around line 47):

```tsx
<div className="flex items-start justify-between gap-2">
  <h2 className="font-medium leading-tight">{p.name}</h2>
  <Badge variant="secondary">
    {STATUS_LABEL[p.status] ?? p.status}
  </Badge>
</div>
```

- [ ] **Step 2: Replace the header row with the JV-aware version**

Replace the block above with:

```tsx
<div className="flex items-start justify-between gap-2">
  <div className="flex items-center gap-1.5">
    <h2 className="font-medium leading-tight">{p.name}</h2>
    {p.isJointVenture && (
      <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-300 text-[10px] px-1.5 py-0">
        JV
      </Badge>
    )}
  </div>
  <Badge variant="secondary">
    {STATUS_LABEL[p.status] ?? p.status}
  </Badge>
</div>
```

No import changes needed — `Badge` is already imported.

- [ ] **Step 3: Verify the dev server renders correctly**

```bash
npm run dev
```

Open `http://localhost:3000/projects`. Confirm:
- A project with `isJointVenture: true` shows an indigo "JV" badge next to its name
- A project without the flag shows no badge
- The status badge on the right is unaffected
- Dark mode renders the badge with indigo-900 background and indigo-300 text

- [ ] **Step 4: Commit**

```bash
git add app/(authed)/projects/page.tsx
git commit -m "feat: show JV badge on project card when isJointVenture is true"
```
