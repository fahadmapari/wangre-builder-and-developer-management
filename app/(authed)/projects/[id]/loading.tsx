import { TableSkeleton, TileSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem)] w-full max-w-6xl flex-col overflow-hidden px-6">
      <div className="shrink-0 pb-4 pt-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 pb-8">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-9 w-72" />
        <TableSkeleton rows={8} cols={6} />
      </div>
    </div>
  )
}
