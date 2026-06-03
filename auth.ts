import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { MongoDBAdapter } from "@auth/mongodb-adapter"
import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type { Role } from "@/types"
import {
  getAllowedEmailByEmail,
  isAllowedEmailsEmpty,
  seedAllowedEmails,
} from "@/lib/settings/repository"

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(client, {
    databaseName: process.env.MONGODB_DB,
  }),
  session: { strategy: "database" },
  providers: [Google],
  pages: { signIn: "/login" },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id
      session.user.role = user.role ?? "floor_manager"
      return session
    },
    async signIn({ user }) {
      const email = (user.email ?? "").toLowerCase().trim()
      if (!email) return false

      // Bootstrap/migration: seed allowedEmails on first run
      if (await isAllowedEmailsEmpty()) {
        await seedAllowedEmails(adminEmails)
      }

      const entry = await getAllowedEmailByEmail(email)
      return entry !== null
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return
      const email = (user.email ?? "").toLowerCase()
      // Role comes from allowedEmails (set by signIn callback before this fires)
      const entry = await getAllowedEmailByEmail(email)
      const role: Role = entry?.role ?? "floor_manager"
      await getDb()
        .collection("users")
        .updateOne(
          { _id: new ObjectId(user.id) },
          { $set: { role, createdAt: new Date() } }
        )
    },
  },
})
