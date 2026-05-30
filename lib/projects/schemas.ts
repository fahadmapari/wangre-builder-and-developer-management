import { z } from "zod"
import type { ObjectId } from "mongodb"

export const ProjectStatusSchema = z.enum([
  "planning",
  "under_construction",
  "completed",
  "on_hold",
])
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>

export const CreateProjectInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(120, "Name too long"),
    location: z
      .string()
      .trim()
      .min(1, "Location is required")
      .max(200, "Location too long"),
    totalUnits: z.coerce
      .number()
      .int("Must be a whole number")
      .min(1, "Must be at least 1")
      .max(2000, "Too large"),
    totalParkings: z.coerce
      .number()
      .int("Must be a whole number")
      .min(0, "Cannot be negative")
      .max(2000, "Too large"),
    status: ProjectStatusSchema.default("planning"),
    notes: z.string().max(2000).optional().default(""),
    startingUnitNumber: z.coerce
      .number()
      .int()
      .min(1)
      .max(99999)
      .default(101),
    unitsPerFloor: z.coerce
      .number()
      .int()
      .min(1, "At least 1")
      .max(9, "At most 9 (100s numbering convention)")
      .default(4),
    parkingPrefix: z
      .string()
      .trim()
      .min(1, "Required")
      .max(8, "Too long")
      .default("P"),
  })
  .refine(
    (data) => {
      const pos = data.startingUnitNumber % 100
      return pos >= 1 && pos + data.unitsPerFloor - 1 <= 99
    },
    {
      message:
        "Starting number's position on its floor + units per floor must fit within one floor (e.g. 101 + 4 → 101–104 ✓; 199 + 4 ✗).",
      path: ["startingUnitNumber"],
    }
  )

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>

// NOTE: When/if a future phase adds an "add more units later" flow, it must
// update projects.totalUnits in the SAME transaction as the units insertMany.
export type Project = {
  _id: ObjectId
  name: string
  location: string
  status: ProjectStatus
  totalUnits: number
  totalParkings: number
  notes?: string
  // Numbering params, now persisted (consumed at create + reused by expand-capacity)
  startingUnitNumber?: number
  unitsPerFloor?: number
  parkingPrefix?: string
  // Edit tracking — present after first post-Phase-10 edit
  lastUpdatedBy?: ObjectId
  lastUpdatedAt?: Date
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

export type UnitType = "apartment" | "parking"
export type UnitStatus = "available" | "sold"

export type Unit = {
  _id: ObjectId
  projectId: ObjectId
  type: UnitType
  number: string
  floor: number
  areaSqft: number
  salePrice: number
  status: UnitStatus
  soldAt?: Date
  soldPriceTotal?: number
  buyerName?: string
  notes?: string
  lastUpdatedBy?: ObjectId
  lastUpdatedAt?: Date
  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date
}

export const UpdateProjectInputSchema = z.object({
  projectId: z.string().min(1, "Missing project"),
  name: z.string().trim().min(1).max(120).optional(),
  location: z.string().trim().min(1).max(200).optional(),
  status: ProjectStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
})
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>

export const ExpandProjectCapacityInputSchema = z
  .object({
    projectId: z.string().min(1, "Missing project"),
    additionalUnits: z.coerce.number().int().min(0).max(2000).default(0),
    additionalParkings: z.coerce.number().int().min(0).max(2000).default(0),
  })
  .refine((v) => v.additionalUnits + v.additionalParkings > 0, {
    message: "Specify at least one count to add",
    path: ["additionalUnits"],
  })
export type ExpandProjectCapacityInput = z.infer<typeof ExpandProjectCapacityInputSchema>

export const EditUnitInputSchema = z.object({
  unitId: z.string().min(1, "Missing unit"),
  number: z.string().trim().min(1).max(20).optional(),
  floor: z.coerce.number().int().min(0).max(99).optional(),
  areaSqft: z.coerce.number().positive().max(100_000).optional(),
  salePrice: z.coerce.number().min(0).max(1_000_000_000).optional(),
  notes: z.string().max(2000).optional(),
})
export type EditUnitInput = z.infer<typeof EditUnitInputSchema>

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string }
