"use client"

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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
import type { MonthlyFinancialPoint } from "@/lib/dashboard/repository"
import { monthLabel } from "@/lib/dashboard/dates"
import { formatINR, formatINRCompact } from "@/lib/dashboard/format"

const config = {
  revenue: { label: "Revenue", color: "var(--chart-2)" },
  expenses: { label: "Expenses", color: "var(--chart-4)" },
  net: { label: "Net", color: "var(--chart-1)" },
  cumulative: { label: "Available funds", color: "var(--chart-3)" },
} satisfies ChartConfig

type Row = MonthlyFinancialPoint & { net: number; cumulative: number }

export function FinancialTrends({ monthly }: { monthly: MonthlyFinancialPoint[] }) {
  const data: Row[] = monthly.reduce<Row[]>((acc, m) => {
    const net = m.revenue - m.expenses
    const prev = acc.at(-1)?.cumulative ?? 0
    return [...acc, { ...m, net, cumulative: prev + m.capital + net }]
  }, [])

  const hasActivity = monthly.some(
    (m) => m.revenue !== 0 || m.expenses !== 0 || m.capital !== 0,
  )

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Financial trends
      </h2>
      {!hasActivity ? (
        <Empty>No financial activity in this range.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Revenue vs Expenses by month">
            <ChartContainer config={config} className="h-[260px] w-full">
              <BarChart data={data} margin={{ left: 4, right: 4 }}>
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
                            {config[name as keyof typeof config]?.label ?? name}
                          </span>
                          <span className="font-mono">{formatINR(Number(value))}</span>
                        </span>
                      )}
                    />
                  }
                />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                <Bar dataKey="expenses" fill="var(--color-expenses)" radius={4} />
              </BarChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard title="Net by month">
            <ChartContainer config={config} className="h-[260px] w-full">
              <LineChart data={data} margin={{ left: 4, right: 4 }}>
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
                      formatter={(value) => (
                        <span className="font-mono">{formatINR(Number(value))}</span>
                      )}
                    />
                  }
                />
                <Line
                  dataKey="net"
                  stroke="var(--color-net)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard title="Cumulative available funds" full>
            <ChartContainer config={config} className="h-[260px] w-full">
              <AreaChart data={data} margin={{ left: 4, right: 4 }}>
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
                      formatter={(value) => (
                        <span className="font-mono">{formatINR(Number(value))}</span>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="cumulative"
                  stroke="var(--color-cumulative)"
                  fill="var(--color-cumulative)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </ChartCard>
        </div>
      )}
    </section>
  )
}

function ChartCard({
  title,
  children,
  full,
}: {
  title: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <Card className={full ? "lg:col-span-2" : ""}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card className="grid place-items-center p-12 text-sm text-muted-foreground">
      {children}
    </Card>
  )
}
