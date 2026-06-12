"use client"

import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { useDisclosure } from "@/lib/hooks"

const AddMaterialDialog = dynamic(() =>
  import("./add-material-dialog.body").then((m) => m.AddMaterialDialog),
)

export function AddMaterialButton() {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button variant="outline" onClick={() => onOpenChange(true)}>
        Add material
      </Button>
      {mounted ? (
        <AddMaterialDialog
          key={contentKey}
          open={open}
          onOpenChange={onOpenChange}
        />
      ) : null}
    </>
  )
}
