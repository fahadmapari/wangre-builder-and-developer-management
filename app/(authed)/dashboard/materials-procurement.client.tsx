"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
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
  MaterialFlowPoint,
  MaterialSpendPoint,
  StockValue,
} from "@/lib/dashboard/repository"
import { monthLabel } from "@/lib/dashboard/dates"
import { formatINR, formatINRCompact } from "@/lib/dashboard/format"

const spendConfig = {
  spend: { label: "Spend", color: "var(--chart-4)" },
} satisfies ChartConfig

const flowConfig = {
  purchases: { label: "Purchases", color: "var(--chart-2)" },
  consumption: { label: "Consumption", color: "var(--chart-5)" },
} satisfies ChartConfig

export function MaterialsProcurement({
  topMaterials,
  monthlyFlow,
  stockValue,
}: {
  topMaterials: MaterialSpendPoint[]
  monthlyFlow: MaterialFlowPoint[]
  stockValue: StockValue
}) {
  const hasFlow = monthlyFlow.some(
    (m) => m.purchases !== 0 || m.consumption !== 0,
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Materials &amp; procurement
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top materials by spend</CardTitle>
          </CardHeader>
          <CardContent>
            {topMaterials.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No purchases in this range.
              </p>
            ) : (
              <ChartContainer
                config={spendConfig}
                className="w-full"
                style={{ height: Math.max(160, topMaterials.length * 40) }}
              >
                <BarChart
                  data={topMaterials}
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
                    dataKey="name"
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
                  <Bar dataKey="spend" fill="var(--color-spend)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Purchases vs consumption by month</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasFlow ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No material movements in this range.
              </p>
            ) : (
              <ChartContainer config={flowConfig} className="h-[260px] w-full">
                <BarChart data={monthlyFlow} margin={{ left: 4, right: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={monthLabel}
                  />
                  <YAxis
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
                              {flowConfig[name as keyof typeof flowConfig]?.label ?? name}
                            </span>
                            <span className="font-mono">{formatINR(Number(value))}</span>
                          </span>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="purchases" fill="var(--color-purchases)" radius={4} />
                  <Bar dataKey="consumption" fill="var(--color-consumption)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Current stock value on hand</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <span className="font-mono text-2xl">{formatINR(stockValue.total)}</span>
            {stockValue.byMaterial.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {stockValue.byMaterial.slice(0, 8).map((m) => (
                  <li key={m.name} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{m.name}</span>
                    <span className="font-mono">{formatINR(m.value)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No priced stock on hand in scope.
              </p>
            )}
            {stockValue.hasUnpriced ? (
              <p className="text-xs text-muted-foreground">
                Some materials have no catalog price and are excluded from this total.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
