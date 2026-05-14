"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import type { Role } from "@/types"

export function ProjectTabs({ role }: { role: Role }) {
  return (
    <Tabs defaultValue="inventory">
      <TabsList>
        <TabsTrigger value="inventory">Inventory</TabsTrigger>
        <TabsTrigger value="materials">Materials</TabsTrigger>
        {role === "admin" ? (
          <TabsTrigger value="financials">Financials</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="inventory">
        <Placeholder>Inventory listing coming in Phase 3.</Placeholder>
      </TabsContent>
      <TabsContent value="materials">
        <Placeholder>Materials tracking coming in Phase 4.</Placeholder>
      </TabsContent>
      {role === "admin" ? (
        <TabsContent value="financials">
          <Placeholder>Financial ledger coming in Phase 5.</Placeholder>
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
