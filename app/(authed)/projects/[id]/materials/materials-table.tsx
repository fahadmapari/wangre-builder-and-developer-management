import { Card } from "@/components/ui/card"
import type { ProjectMaterialListing } from "@/lib/materials/repository"
import type { Material } from "@/lib/materials/schemas"
import type { Role } from "@/types"
import { AddMaterialButton } from "./add-material-dialog"
import { LogConsumptionButton } from "./log-consumption-dialog"
import { LogReturnButton } from "./log-return-dialog"
import { MovementsSheetButton } from "./movements-sheet"
import {
  RecordPurchaseButton,
  TopLevelRecordPurchaseButton,
  type CatalogPickerEntry,
} from "./record-purchase-dialog"
import {
  MaterialTransferButton,
  type MaterialPickerEntry,
} from "@/app/(authed)/transfers/material-transfer-dialog"
import type { ProjectPickerEntry } from "@/app/(authed)/transfers/money-transfer-dialog"

const INR = new Intl.NumberFormat("en-IN")

function formatUnit(m: Material): string {
  if (m.unit === "other") return m.unitOther || "—"
  if (m.unit === "m2") return "m²"
  if (m.unit === "m3") return "m³"
  return m.unit
}

export function MaterialsTable({
  projectId,
  role,
  rows,
  catalog,
  projects,
}: {
  projectId: string
  role: Role
  rows: ProjectMaterialListing[]
  catalog: CatalogPickerEntry[]
  projects: ProjectPickerEntry[]
}) {
  const showSpent = role === "admin"
  const isAdmin = role === "admin"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2">
        <AddMaterialButton />
        {isAdmin ? (
          <TopLevelRecordPurchaseButton
            projectId={projectId}
            catalog={catalog}
          />
        ) : null}
      </div>
      {rows.length === 0 ? (
        <Card className="grid place-items-center gap-2 p-12 text-sm text-muted-foreground">
          <p>No materials tracked for this project yet.</p>
          <p>Use &ldquo;Add material&rdquo; to register one, then &ldquo;Record purchase&rdquo;.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Stock on hand</th>
                {showSpent ? <th className="px-4 py-3 text-right">Total spent</th> : null}
                <th className="px-4 py-3">Last movement</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <MaterialRow
                  key={String(r.material._id)}
                  row={r}
                  projectId={projectId}
                  isAdmin={isAdmin}
                  showSpent={showSpent}
                  role={role}
                  projects={projects}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function MaterialRow({
  row,
  projectId,
  isAdmin,
  showSpent,
  role,
  projects,
}: {
  row: ProjectMaterialListing
  projectId: string
  isAdmin: boolean
  showSpent: boolean
  role: Role
  projects: ProjectPickerEntry[]
}) {
  const { material, projectMaterial, totalSpent, lastMovementAt } = row
  const stock = projectMaterial?.stockOnHand ?? 0
  const unitLabel = formatUnit(material)
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">{material.name}</td>
      <td className="px-4 py-3 font-mono">{unitLabel}</td>
      <td className="px-4 py-3 text-right font-mono">{stock}</td>
      {showSpent ? (
        <td className="px-4 py-3 text-right font-mono">
          ₹{INR.format(totalSpent)}
        </td>
      ) : null}
      <td className="px-4 py-3 text-muted-foreground">
        {lastMovementAt ? lastMovementAt.toLocaleDateString() : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          {isAdmin ? (
            <RecordPurchaseButton
              projectId={projectId}
              materialId={String(material._id)}
              materialName={material.name}
              unitLabel={unitLabel}
              defaultUnitPrice={material.unitPrice}
            />
          ) : null}
          {isAdmin ? (
            <MaterialTransferButton
              projects={projects}
              materials={[
                {
                  id: String(material._id),
                  name: material.name,
                  unitLabel,
                } satisfies MaterialPickerEntry,
              ]}
              lockedSource={projectId}
              lockedMaterial={String(material._id)}
              triggerLabel="Transfer to project"
            />
          ) : null}
          <LogConsumptionButton
            projectId={projectId}
            materialId={String(material._id)}
            materialName={material.name}
            unitLabel={unitLabel}
            stockOnHand={stock}
          />
          <LogReturnButton
            projectId={projectId}
            materialId={String(material._id)}
            materialName={material.name}
            unitLabel={unitLabel}
          />
          <MovementsSheetButton
            projectId={projectId}
            materialId={String(material._id)}
            materialName={material.name}
            unitLabel={unitLabel}
            role={role}
          />
        </div>
      </td>
    </tr>
  )
}
