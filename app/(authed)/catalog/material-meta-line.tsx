type Props = {
  actorName: string
  at: Date
}

function formatDate(d: Date): string {
  // LOCAL components — never toISOString (UTC drift). Convention from Phase 8.
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function LastUpdatedLine({ actorName, at }: Props) {
  return (
    <p className="text-xs text-muted-foreground">
      Last updated by {actorName} • {formatDate(at)}
    </p>
  )
}
