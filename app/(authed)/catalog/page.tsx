import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { listCatalog } from "@/lib/materials/repository"
import { getDb } from "@/lib/db/client"
import { CatalogTable } from "./catalog-table"
import { NewMaterialButton } from "./new-material-dialog"

export default async function CatalogPage() {
  await requireAdmin()
  const materials = await listCatalog()

  // Bulk lookup of last-updater names — one query for all visible materials.
  const updaterIds = [
    ...new Set(
      materials
        .map((m) => m.lastUpdatedBy?.toHexString())
        .filter((x): x is string => !!x)
    ),
  ].map((s) => new ObjectId(s))

  const updaters =
    updaterIds.length > 0
      ? await getDb()
          .collection<{ _id: ObjectId; name?: string; email?: string }>("users")
          .find(
            { _id: { $in: updaterIds } },
            { projection: { name: 1, email: 1 } }
          )
          .toArray()
      : []

  // Plain Record so it crosses the server→client boundary without issues.
  const updaterById: Record<string, string> = Object.fromEntries(
    updaters.map((u) => [u._id.toHexString(), u.name ?? u.email ?? "(unknown)"])
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Materials catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            Global. Used by every project&apos;s Materials tab.
          </p>
        </div>
        <NewMaterialButton />
      </header>
      <CatalogTable materials={materials} updaterById={updaterById} />
    </div>
  )
}
