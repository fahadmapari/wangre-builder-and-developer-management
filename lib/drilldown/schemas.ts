import { z } from "zod"

// Entity types the drilldown sheet knows how to render. Five variants because
// money/material transfers render differently from plain transactions even
// though they share underlying collections.
export const DrilldownEntityTypeSchema = z.enum([
  "transaction",
  "movement",
  "unit",
  "money_transfer",
  "material_transfer",
])
export type DrilldownEntityType = z.infer<typeof DrilldownEntityTypeSchema>

// Per-variant Details payload. The shapes are kept minimal — the sheet renders
// labelled rows in whatever order the variant lists.
export type TransactionDrilldown =
  | {
      entityType: "transaction"
      kind: "sale"
      occurredAt: Date
      amount: number
      buyerName: string
      unitLabel: string | null
      description: string
      voided: boolean
      isReversal: boolean
      reversedById: string | null
      linkedMovement: {
        materialName: string
        qty: number
        unitLabel: string
      } | null
    }
  | {
      entityType: "transaction"
      kind: "purchase"
      occurredAt: Date
      amount: number
      description: string
      voided: boolean
      isReversal: boolean
      reversedById: string | null
      linkedMovement: {
        materialName: string
        qty: number
        projectName: string
      } | null
    }
  | {
      entityType: "transaction"
      kind: "transfer"
      occurredAt: Date
      amount: number
      direction: "in" | "out"
      peerProjectName: string
      transferGroupId: string
      isReversal: boolean
      reversedAt: Date | null
    }
  | {
      entityType: "transaction"
      kind: "adhoc"
      occurredAt: Date
      amount: number
      txKind: "income" | "expense"
      description: string
      notes: string | null
      voided: boolean
      isReversal: boolean
      reversedById: string | null
    }

export type MovementDrilldown = {
  entityType: "movement"
  occurredAt: Date
  materialName: string
  qty: number
  unitLabel: string
  category: "purchase" | "return" | "consumption" | "transfer_in" | "transfer_out"
  amount: number | null
  purpose: string | null
  notes: string | null
  voided: boolean
  peerProjectName: string | null
}

export type UnitDrilldown = {
  entityType: "unit"
  type: "apartment" | "parking"
  number: string
  floor: number | null
  status: "available" | "sold"
  soldPriceTotal: number | null
  buyerName: string | null
  soldAt: Date | null
}

export type MoneyTransferDrilldown = {
  entityType: "money_transfer"
  sourceProjectName: string
  destProjectName: string
  amount: number
  occurredAt: Date
  transferGroupId: string
  status: "active" | "reversed"
  reversedAt: Date | null
}

export type MaterialTransferDrilldown = {
  entityType: "material_transfer"
  sourceProjectName: string
  destProjectName: string
  materialName: string
  qty: number
  unitLabel: string
  occurredAt: Date
  transferGroupId: string
  status: "active" | "reversed"
  reversedAt: Date | null
}

export type DrilldownDetail =
  | TransactionDrilldown
  | MovementDrilldown
  | UnitDrilldown
  | MoneyTransferDrilldown
  | MaterialTransferDrilldown
