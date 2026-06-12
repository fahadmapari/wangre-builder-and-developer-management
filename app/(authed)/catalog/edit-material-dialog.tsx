"use client"

import dynamic from "next/dynamic"
import { useDisclosure } from "@/lib/hooks"
import { Button } from "@/components/ui/button"
import type { EditableMaterial } from "./edit-material-dialog.body"

export type { EditableMaterial } from "./edit-material-dialog.body"

const EditMaterialDialog = dynamic(() =>
  import("./edit-material-dialog.body").then((m) => m.EditMaterialDialog),
)

export function EditMaterialButton({ material }: { material: EditableMaterial }) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => onOpenChange(true)}>
        Edit
      </Button>
      {mounted ? (
        <EditMaterialDialog
          key={contentKey}
          open={open}
          onOpenChange={onOpenChange}
          material={material}
        />
      ) : null}
    </>
  )
}
