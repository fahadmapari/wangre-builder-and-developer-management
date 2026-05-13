import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { MongoDBAdapter } from "@auth/mongodb-adapter"
import { ObjectId } from "mongodb"
import client from "@/lib/db/client"
import type { Role } from "@/types"

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
      session.user.role = ((user as { role?: Role }).role ?? "floor_manager")
      return session
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return
      const email = (user.email ?? "").toLowerCase()
      const role: Role = adminEmails.includes(email) ? "admin" : "floor_manager"
      await client
        .db(process.env.MONGODB_DB)
        .collection("users")
        .updateOne(
          { _id: new ObjectId(user.id) },
          { $set: { role, createdAt: new Date() } }
        )
    },
  },
})
