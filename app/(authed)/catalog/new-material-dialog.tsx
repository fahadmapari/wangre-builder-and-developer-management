"use client"

import dynamic from "next/dynamic"
import { useDisclosure } from "@/lib/hooks"
import { Button } from "@/components/ui/button"

const NewMaterialDialog = dynamic(() =>
  import("./new-material-dialog.body").then((m) => m.NewMaterialDialog),
)

export function NewMaterialButton() {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button onClick={() => onOpenChange(true)}>New material</Button>
      {mounted ? (
        <NewMaterialDialog key={contentKey} open={open} onOpenChange={onOpenChange} />
      ) : null}
    </>
  )
}
