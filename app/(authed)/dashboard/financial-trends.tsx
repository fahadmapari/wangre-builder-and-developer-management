"use client"

import type { ComponentProps } from "react"
import dynamic from "next/dynamic"
import { ChartCardSkeleton } from "@/components/skeletons"

const Impl = dynamic(
  () => import("./charts.client").then((m) => m.FinancialTrends),
  { ssr: false, loading: () => <ChartCardSkeleton /> },
)

export function FinancialTrends(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />
}
