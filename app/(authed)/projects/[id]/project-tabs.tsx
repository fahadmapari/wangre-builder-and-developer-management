"use client"

import type { ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import type { Role } from "@/types"

type OverviewTab = "summary" | "capital" | "jv"
type DataTab = "inventory" | "materials" | "financials"

function pickOverviewTab(
  raw: string | null,
  isAdmin: boolean,
  isJointVenture: boolean
): OverviewTab {
  if (raw === "capital" && isAdmin) return "capital"
  if (raw === "jv" && isAdmin && isJointVenture) return "jv"
  return "summary"
}

function pickDataTab(raw: string | null, isAdmin: boolean): DataTab {
  if (raw === "materials") return "materials"
  if (raw === "financials" && isAdmin) return "financials"
  return "inventory"
}

export function ProjectTabs({
  role,
  isJointVenture,
  summary,
  capital,
  jointVenture,
  inventory,
  materials,
  financials,
}: {
  role: Role
  isJointVenture: boolean
  summary?: ReactNode
  capital?: ReactNode
  jointVenture?: ReactNode
  inventory?: ReactNode
  materials?: ReactNode
  financials?: ReactNode
}) {
  const sp = useSearchParams()
  const isAdmin = role === "admin"
  const showJV = isAdmin && isJointVenture
  const rawTab = sp.get("tab")
  const overviewDefault = pickOverviewTab(rawTab, isAdmin, isJointVenture)
  const dataDefault = pickDataTab(rawTab, isAdmin)
  return (
    <>
      <Tabs defaultValue={overviewDefault} className="shrink-0">
        {isAdmin ? (
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="capital">Capital</TabsTrigger>
            {showJV ? (
              <TabsTrigger value="jv">Joint Venture</TabsTrigger>
            ) : null}
          </TabsList>
        ) : null}
        <TabsContent value="summary" className="overflow-auto">
          {summary}
        </TabsContent>
        {isAdmin ? (
          <TabsContent value="capital" className="overflow-auto">
            {capital}
          </TabsContent>
        ) : null}
        {showJV ? (
          <TabsContent value="jv" className="overflow-auto">
            {jointVenture}
          </TabsContent>
        ) : null}
      </Tabs>
      <Tabs defaultValue={dataDefault} className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="financials">Financials</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="inventory" className="min-h-0 overflow-hidden">
          {inventory ?? (
            <Placeholder>Inventory listing coming in Phase 3.</Placeholder>
          )}
        </TabsContent>
        <TabsContent value="materials" className="min-h-0 overflow-hidden">
          {materials ?? (
            <Placeholder>Materials tracking coming in Phase 4.</Placeholder>
          )}
        </TabsContent>
        {isAdmin ? (
          <TabsContent value="financials" className="min-h-0 overflow-hidden">
            {financials ?? (
              <Placeholder>Financial ledger coming in Phase 5.</Placeholder>
            )}
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
      {children}
    </Card>
  )
}
