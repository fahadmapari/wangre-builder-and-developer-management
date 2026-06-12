"use client"

import type { ComponentProps } from "react"
import dynamic from "next/dynamic"
import { ChartCardSkeleton } from "@/components/skeletons"

const Impl = dynamic(
  () => import("./materials-procurement.client").then((m) => m.MaterialsProcurement),
  { ssr: false, loading: () => <ChartCardSkeleton /> },
)

export function MaterialsProcurement(props: ComponentProps<typeof Impl>) {
  return <Impl {...props} />
}
