import { requireAdmin } from "@/lib/auth/session"
import { listCatalog } from "@/lib/materials/repository"
import { CatalogTable } from "./catalog-table"
import { NewMaterialButton } from "./new-material-dialog"

export default async function CatalogPage() {
  await requireAdmin()
  const materials = await listCatalog()

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
      <CatalogTable materials={materials} />
    </div>
  )
}
