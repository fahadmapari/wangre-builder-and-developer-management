"use client"

import type { ComponentProps } from "react"
import dynamic from "next/dynamic"
import { ChartCardSkeleton } from "@/components/skeletons"

const Impl = dynamic(
  () => import("./charts.client").then((m) => m.SalesInventory),
  { ssr: false, loading: () => <ChartCardSkeleton /> },
)

export function SalesInventory(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />
}
