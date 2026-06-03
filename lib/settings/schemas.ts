import { z } from "zod"
import type { ObjectId } from "mongodb"
import type { Role } from "@/types"

export type AllowedEmail = {
  _id: ObjectId
  email: string
  role: Role
  addedAt: Date
  addedByEmail: string
}

export type UserRow = {
  _id: ObjectId
  email: string
  name: string | null
  image: string | null
  role: Role
}

export const AddAllowedEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Must be a valid email address"),
  role: z.enum(["admin", "floor_manager"]),
})
export type AddAllowedEmailInput = z.infer<typeof AddAllowedEmailSchema>

export const UpdateUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "floor_manager"]),
})
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>
