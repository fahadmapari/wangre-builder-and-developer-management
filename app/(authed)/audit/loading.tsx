import { FilterBarSkeleton, TableSkeleton } from "@/components/skeletons"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
      <FilterBarSkeleton fields={4} />
      <TableSkeleton rows={10} cols={5} />
    </div>
  )
}
