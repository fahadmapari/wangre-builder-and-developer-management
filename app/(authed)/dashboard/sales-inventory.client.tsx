"use client"

import { useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type {
  InventoryBreakdown,
  MonthlySalesPoint,
  ProjectRevenuePoint,
} from "@/lib/dashboard/repository"
import { monthLabel } from "@/lib/dashboard/dates"
import { formatINR, formatINRCompact } from "@/lib/dashboard/format"

const velocityConfig = {
  unitsSold: { label: "Units sold", color: "var(--chart-1)" },
  revenue: { label: "Sale revenue", color: "var(--chart-2)" },
} satisfies ChartConfig

const inventoryConfig = {
  sold: { label: "Sold", color: "var(--chart-3)" },
  available: { label: "Available", color: "var(--chart-1)" },
} satisfies ChartConfig

const revByProjectConfig = {
  revenue: { label: "Revenue", color: "var(--chart-2)" },
} satisfies ChartConfig

export function SalesInventory({
  inventory,
  monthlySales,
  revenueByProject,
  scoped,
}: {
  inventory: InventoryBreakdown
  monthlySales: MonthlySalesPoint[]
  revenueByProject: ProjectRevenuePoint[]
  scoped: boolean // true = single project (hides revenue-by-project)
}) {
  const router = useRouter()
  const aptData = [
    { key: "sold", label: "Sold", value: inventory.soldApartments, fill: "var(--color-sold)" },
    {
      key: "available",
      label: "Available",
      value: inventory.availableApartments,
      fill: "var(--color-available)",
    },
  ]
  const hasApts = inventory.soldApartments + inventory.availableApartments > 0
  const hasSales = monthlySales.some((m) => m.unitsSold !== 0 || m.revenue !== 0)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Sales &amp; inventory
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Apartment inventory</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasApts ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No apartments in scope.
              </p>
            ) : (
              <>
                <ChartContainer
                  config={inventoryConfig}
                  className="mx-auto aspect-square h-[240px]"
                >
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value, name) => (
                            <span className="flex w-full justify-between gap-3">
                              <span className="text-muted-foreground">{name}</span>
                              <span className="font-mono">{Number(value)}</span>
                            </span>
                          )}
                        />
                      }
                    />
                    <Pie
                      data={aptData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={60}
                      outerRadius={90}
                    >
                      {aptData.map((d) => (
                        <Cell key={d.key} fill={d.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <p className="mt-2 text-center text-sm text-muted-foreground">
                  Parkings: {inventory.soldParkings} sold /{" "}
                  {inventory.soldParkings + inventory.availableParkings} total
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales velocity</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasSales ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No sales in this range.
              </p>
            ) : (
              <ChartContainer config={velocityConfig} className="h-[240px] w-full">
                <ComposedChart data={monthlySales} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={monthLabel}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={formatINRCompact}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => monthLabel(String(v))}
                        formatter={(value, name) => (
                          <span className="flex w-full justify-between gap-3">
                            <span className="text-muted-foreground">
                              {velocityConfig[name as keyof typeof velocityConfig]?.label ??
                                name}
                            </span>
                            <span className="font-mono">
                              {name === "revenue"
                                ? formatINR(Number(value))
                                : Number(value)}
                            </span>
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="unitsSold"
                    fill="var(--color-unitsSold)"
                    radius={4}
                  />
                  <Line
                    yAxisId="right"
                    dataKey="revenue"
                    stroke="var(--color-revenue)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {!scoped ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Revenue by project</CardTitle>
            </CardHeader>
            <CardContent>
              {revenueByProject.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No project revenue in this range.
                </p>
              ) : (
                <>
                  <ChartContainer
                    config={revByProjectConfig}
                    className="w-full"
                    style={{ height: Math.max(160, revenueByProject.length * 40) }}
                  >
                    <BarChart
                      data={revenueByProject}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid horizontal={false} />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatINRCompact}
                      />
                      <YAxis
                        type="category"
                        dataKey="projectName"
                        tickLine={false}
                        axisLine={false}
                        width={140}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => (
                              <span className="font-mono">{formatINR(Number(value))}</span>
                            )}
                          />
                        }
                      />
                      <Bar
                        dataKey="revenue"
                        fill="var(--color-revenue)"
                        radius={4}
                        cursor="pointer"
                        onClick={(entry) => {
                          const pid = (entry as unknown as { projectId?: string })
                            .projectId
                          if (pid) router.push(`/projects/${pid}?tab=financials`)
                        }}
                      />
                    </BarChart>
                  </ChartContainer>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Click a bar to open that project&apos;s financials.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  )
}
