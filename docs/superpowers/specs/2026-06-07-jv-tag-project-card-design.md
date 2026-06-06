# JV Tag on Project Card

**Date:** 2026-06-07

## Summary

Show a "JV" badge on project cards when `isJointVenture` is `true`, so users can identify joint-venture projects at a glance from the project list.

## Data

`isJointVenture?: boolean` already exists on the `Project` type (`lib/projects/schemas.ts`). No schema, migration, or API changes needed.

## UI Change

**File:** `app/(authed)/projects/page.tsx`

Wrap the `<h2>` project name in a flex row alongside a conditional JV badge. The badge reuses the existing indigo JV style established in `unit-row.tsx`.

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
  <Badge variant="secondary">{STATUS_LABEL[p.status] ?? p.status}</Badge>
</div>
```

## Scope

- **One file changed:** `app/(authed)/projects/page.tsx`
- No new components, no data-layer changes, no tests required
