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

// Only used for first-run bootstrap — not consulted for ongoing access control
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
      try {
        const email = (user.email ?? "").toLowerCase().trim()
        if (!email) return false

        // Bootstrap is a one-time operation on first sign-in to a fresh DB.
        // Concurrent first sign-ins create a small race window; this is acceptable
        // because bootstrap is not repeated once the collection is populated.
        if (await isAllowedEmailsEmpty()) {
          await seedAllowedEmails(adminEmails)
        }

        const entry = await getAllowedEmailByEmail(email)
        return entry !== null
      } catch (e) {
        console.error("[auth] signIn DB error:", e)
        throw e
      }
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return
      const email = (user.email ?? "").toLowerCase().trim()
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
