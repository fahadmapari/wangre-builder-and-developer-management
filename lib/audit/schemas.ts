import { z } from "zod"
import type { ObjectId } from "mongodb"

export const AuditActionSchema = z.enum(["created", "voided", "reversed", "updated"])
export type AuditAction = z.infer<typeof AuditActionSchema>

export const AuditEntityTypeSchema = z.enum([
  "transaction",
  "movement",
  "project",
  "unit",
  "material",
])
export type AuditEntityType = z.infer<typeof AuditEntityTypeSchema>

// Parsed filter shape consumed by the repository. `from`/`to` are inclusive
// date-only bounds; the repository expands `to` to end-of-day on the query side.
export type AuditFilters = {
  from: Date
  to: Date
  actorId?: ObjectId
  action?: AuditAction
  entityType?: AuditEntityType
  projectId?: ObjectId
  page: number     // 1-based
  pageSize: number // default 50
}

export type AuditEvent = {
  id: string                       // synthetic: `${entityType}:${entityId}:${action}`
  occurredAt: Date                 // sort key
  actorId: ObjectId
  actorName: string                // denormalized at query time
  actorRole: "admin" | "floor_manager"
  action: AuditAction
  entityType: AuditEntityType
  entityId: ObjectId
  projectId?: ObjectId             // absent for materials catalog
  projectName?: string             // denormalized at query time
  summary: string                  // human-readable
  refUrl?: string                  // optional deep-link to context page
}
