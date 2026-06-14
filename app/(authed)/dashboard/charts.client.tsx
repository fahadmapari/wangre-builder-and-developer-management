"use client"

// Single client module that re-exports all three recharts chart sections.
// Every dashboard chart wrapper lazy-imports from THIS module so recharts is
// bundled into one shared on-demand chunk instead of being duplicated across
// three separate dynamic() boundaries.
export { FinancialTrends } from "./financial-trends.client"
export { SalesInventory } from "./sales-inventory.client"
export { MaterialsProcurement } from "./materials-procurement.client"
