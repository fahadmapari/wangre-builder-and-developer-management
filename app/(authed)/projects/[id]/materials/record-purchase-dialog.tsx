"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

export type CatalogPickerEntry = {
  materialId: string
  name: string
  unit: string
  unitOther: string
  unitPrice: number | null
}

const RecordPurchaseDialog = dynamic(() =>
  import("./record-purchase-dialog.body").then((m) => m.RecordPurchaseDialog),
)

const TopLevelPurchaseDialog = dynamic(() =>
  import("./record-purchase-dialog.body").then((m) => m.TopLevelPurchaseDialog),
)

export function RecordPurchaseButton({
  projectId,
  materialId,
  materialName,
  unitLabel,
  defaultUnitPrice,
}: {
  projectId: string
  materialId: string
  materialName: string
  unitLabel: string
  defaultUnitPrice: number | null
}) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button size="sm" onClick={() => onOpenChange(true)}>
        Record purchase
      </Button>
      {mounted ? (
        <RecordPurchaseDialog
          key={contentKey}
          open={open}
          onOpenChange={onOpenChange}
          projectId={projectId}
          materialId={materialId}
          materialName={materialName}
          unitLabel={unitLabel}
          defaultUnitPrice={defaultUnitPrice}
        />
      ) : null}
    </>
  )
}

// Top-level "Record purchase" button — opens a dialog with a material picker.
// Used when no per-row button exists yet (the bootstrap case where a project
// has no tracked materials).
export function TopLevelRecordPurchaseButton({
  projectId,
  catalog,
}: {
  projectId: string
  catalog: CatalogPickerEntry[]
}) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button onClick={() => onOpenChange(true)}>Record purchase</Button>
      {mounted ? (
        <TopLevelPurchaseDialog
          key={contentKey}
          open={open}
          onOpenChange={onOpenChange}
          projectId={projectId}
          catalog={catalog}
        />
      ) : null}
    </>
  )
}
