"use server"

import { ObjectId } from "mongodb"
import { requireAdmin } from "@/lib/auth/session"
import { listEntityHistory } from "@/lib/audit/repository"
import type { AuditEvent, AuditEntityType } from "@/lib/audit/schemas"
import type { ActionResult } from "@/lib/projects/schemas"

// AuditEntityType values that getEntityHistoryAction accepts. Server-side
// allowlist matches the union in schemas.ts.
const VALID_TYPES: AuditEntityType[] = [
  "transaction",
  "movement",
  "project",
  "unit",
  "material",
]

export async function getEntityHistoryAction(
  entityType: string,
  entityId: string
): Promise<ActionResult<AuditEvent[]>> {
  await requireAdmin()
  if (!VALID_TYPES.includes(entityType as AuditEntityType)) {
    return { ok: false, error: "Invalid entity type." }
  }
  if (!ObjectId.isValid(entityId)) {
    return { ok: false, error: "Invalid entity id." }
  }
  try {
    const events = await listEntityHistory(
      entityType as AuditEntityType,
      new ObjectId(entityId)
    )
    return { ok: true, data: events }
  } catch (err) {
    console.error("getEntityHistoryAction failed", err)
    return { ok: false, error: "Could not load history. Please try again." }
  }
}
