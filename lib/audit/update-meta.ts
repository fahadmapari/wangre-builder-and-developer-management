import { ObjectId } from "mongodb"

/**
 * Merges audit-edit metadata into a `$set` payload for findOneAndUpdate.
 *
 * Every user-initiated edit on tracked entities (projects, units, materials)
 * must go through this helper so the audit log can read who-edited-when from
 * the entity doc itself (Phase 7 read-from-existing-fields pattern).
 *
 * Also sets `updatedAt` so the existing convention stays in sync.
 */
export function withUpdateMeta<T extends Record<string, unknown>>(
  set: T,
  userId: string
): T & { lastUpdatedBy: ObjectId; lastUpdatedAt: Date; updatedAt: Date } {
  const now = new Date()
  return {
    ...set,
    lastUpdatedBy: new ObjectId(userId),
    lastUpdatedAt: now,
    updatedAt: now,
  } as T & { lastUpdatedBy: ObjectId; lastUpdatedAt: Date; updatedAt: Date }
}
