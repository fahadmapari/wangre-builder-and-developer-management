# Project Card Building Header

**Date:** 2026-06-07
**Status:** Approved

## Problem

Project cards are visually uniform — every card looks identical at a glance. Users cannot quickly distinguish small boutique projects from large landmark developments without reading the unit count.

## Goal

Add a full-width colored banner at the top of each project card containing a large centered building icon. Both the icon and the color vary based on `totalUnits`, making each card tier visually distinct.

## Design

### Header Strip

- Full-width `<div>` prepended as the first child inside `<Card>`
- Height: `h-24` (96px)
- `<Card>` gets `overflow-hidden` — this clips the strip to the card's existing border-radius, so no extra rounding is needed on the strip itself
- Single Lucide icon, size 48px (`w-12 h-12`), centered with `flex items-center justify-center`
- Icon color: white (`text-white`)

### Five Tiers

| Tier | `totalUnits` range | Lucide icon | Tailwind bg (light) | Tailwind bg (dark) |
|------|--------------------|-------------|----------------------|--------------------|
| Boutique | 1–12 | `Home` | `bg-amber-400` | `dark:bg-amber-700` |
| Low-rise | 13–30 | `Building2` | `bg-emerald-500` | `dark:bg-emerald-700` |
| Mid-rise | 31–80 | `Building` | `bg-sky-500` | `dark:bg-sky-700` |
| High-rise | 81–200 | `Hotel` | `bg-indigo-500` | `dark:bg-indigo-700` |
| Landmark | 201+ | `Landmark` | `bg-slate-600` | `dark:bg-slate-700` |

### Tier Helper

A pure function `getBuildingTier(totalUnits: number)` returns the correct icon component and background classes. Defined inline at the top of [app/(authed)/projects/page.tsx](../../../../app/(authed)/projects/page.tsx). No I/O, no side effects.

```ts
function getBuildingTier(units: number) {
  if (units <= 12)  return { Icon: Home,     bg: "bg-amber-400 dark:bg-amber-700" }
  if (units <= 30)  return { Icon: Building2, bg: "bg-emerald-500 dark:bg-emerald-700" }
  if (units <= 80)  return { Icon: Building,  bg: "bg-sky-500 dark:bg-sky-700" }
  if (units <= 200) return { Icon: Hotel,     bg: "bg-indigo-500 dark:bg-indigo-700" }
  return             { Icon: Landmark,  bg: "bg-slate-600 dark:bg-slate-700" }
}
```

### Card Structure Change

```tsx
<Card className="flex h-full flex-col overflow-hidden transition hover:border-foreground/30">
  {/* NEW: building header */}
  <div className={cn("flex h-24 items-center justify-center", tier.bg)}>
    <tier.Icon className="h-12 w-12 text-white" />
  </div>
  {/* existing body — unchanged */}
  <div className="flex flex-col gap-3 p-5">
    ...
  </div>
</Card>
```

The existing body content (name, badges, location, stats, date) moves into an inner `<div className="flex flex-col gap-3 p-5">` wrapper to separate it from the header. The `gap-3 p-5` classes move from `<Card>` to this inner div.

## Files Changed

| File | Change |
|------|--------|
| [app/(authed)/projects/page.tsx](../../../../app/(authed)/projects/page.tsx) | Add `getBuildingTier` helper, add header strip to card JSX, add `overflow-hidden` to Card, restructure card body into inner div |

## Out of Scope

- No changes to card body layout, stats, or badges
- No new component files — everything stays in the page
- No database changes
