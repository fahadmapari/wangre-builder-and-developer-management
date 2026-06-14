"use client"

import dynamic from "next/dynamic"
import { useDisclosure } from "@/lib/hooks"
import { Button } from "@/components/ui/button"

const NewProjectDialog = dynamic(() =>
  import("./new-project-dialog.body").then((m) => m.NewProjectDialog),
)

export function NewProjectButton({ variant }: { variant?: "cta" }) {
  const { open, onOpenChange, contentKey, mounted } = useDisclosure()
  return (
    <>
      <Button
        onClick={() => onOpenChange(true)}
        size={variant === "cta" ? "default" : "sm"}
      >
        New project
      </Button>
      {mounted ? (
        <NewProjectDialog key={contentKey} open={open} onOpenChange={onOpenChange} />
      ) : null}
    </>
  )
}
