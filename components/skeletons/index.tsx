import { Skeleton } from "@/components/ui/skeleton"

export function TileSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-24" />
    </div>
  )
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <Skeleton className="h-24 w-full rounded-none" />
            <div className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function FilterBarSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {Array.from({ length: fields }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-40" />
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex gap-4 border-b border-border bg-muted px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartCardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-[260px] w-full" />
    </div>
  )
}

export function FormFieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}
