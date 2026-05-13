import type { DefaultSession } from "next-auth"

export type Role = "admin" | "floor_manager"

export interface AppUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  role: Role
  createdAt: Date
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
    } & DefaultSession["user"]
  }

  interface User {
    role?: Role
  }
}
