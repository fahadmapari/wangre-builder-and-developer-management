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

type TabValue =
  | "summary"
  | "capital"
  | "jv"
  | "inventory"
  | "materials"
  | "financials"

function pickTab(
  raw: string | null,
  role: Role,
  isJointVenture: boolean
): TabValue {
  const isAdmin = role === "admin"
  if (raw === "capital" && isAdmin) return "capital"
  if (raw === "jv" && isAdmin && isJointVenture) return "jv"
  if (raw === "inventory") return "inventory"
  if (raw === "materials") return "materials"
  if (raw === "financials" && isAdmin) return "financials"
  return "summary"
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
  const defaultTab = pickTab(sp.get("tab"), role, isJointVenture)
  return (
    <Tabs defaultValue={defaultTab} className="h-full">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        {isAdmin ? <TabsTrigger value="capital">Capital</TabsTrigger> : null}
        {showJV ? (
          <TabsTrigger value="jv">Joint Venture</TabsTrigger>
        ) : null}
        <TabsTrigger value="inventory">Inventory</TabsTrigger>
        <TabsTrigger value="materials">Materials</TabsTrigger>
        {isAdmin ? (
          <TabsTrigger value="financials">Financials</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="summary" className="min-h-0 overflow-auto">
        {summary}
      </TabsContent>
      {isAdmin ? (
        <TabsContent value="capital" className="min-h-0 overflow-auto">
          {capital}
        </TabsContent>
      ) : null}
      {showJV ? (
        <TabsContent value="jv" className="min-h-0 overflow-auto">
          {jointVenture}
        </TabsContent>
      ) : null}
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
  )
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
      {children}
    </Card>
  )
}
