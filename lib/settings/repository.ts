import { ObjectId } from "mongodb"
import { getDb } from "@/lib/db/client"
import type { Role } from "@/types"
import type { AllowedEmail, UserRow } from "./schemas"

// ── Types ────────────────────────────────────────────────────────────────────

type UserDoc = {
  _id: ObjectId
  email: string
  name?: string | null
  image?: string | null
  role?: Role
}

// ── AllowedEmails ────────────────────────────────────────────────────────────

export async function listAllowedEmails(): Promise<AllowedEmail[]> {
  return getDb()
    .collection<AllowedEmail>("allowedEmails")
    .find({})
    .sort({ addedAt: -1 })
    .toArray()
}

export async function getAllowedEmailByEmail(
  email: string
): Promise<AllowedEmail | null> {
  return getDb()
    .collection<AllowedEmail>("allowedEmails")
    .findOne({ email: email.toLowerCase().trim() })
}

export async function upsertAllowedEmail(
  email: string,
  role: Role,
  addedByEmail: string
): Promise<void> {
  const normalised = email.toLowerCase().trim()
  await getDb()
    .collection<AllowedEmail>("allowedEmails")
    .updateOne(
      { email: normalised },
      {
        $set: { role, addedByEmail },
        $setOnInsert: { email: normalised, addedAt: new Date() },
      },
      { upsert: true }
    )
}

export async function deleteAllowedEmailByEmail(email: string): Promise<void> {
  await getDb()
    .collection<AllowedEmail>("allowedEmails")
    .deleteOne({ email: email.toLowerCase().trim() })
}

export async function isAllowedEmailsEmpty(): Promise<boolean> {
  const count = await getDb().collection("allowedEmails").countDocuments()
  return count === 0
}

// Seeds from ADMIN_EMAILS (bootstrap) + all existing users (migration).
// Uses upsert so it is idempotent and safe under concurrent calls.
export async function seedAllowedEmails(adminEmails: string[]): Promise<void> {
  const db = getDb()
  const existingUsers = await db
    .collection<{ email: string; role?: Role }>("users")
    .find({}, { projection: { email: 1, role: 1 } })
    .toArray()

  const seen = new Set<string>()
  const entries: Array<{ email: string; role: Role }> = []

  for (const u of existingUsers) {
    const email = (u.email ?? "").toLowerCase().trim()
    if (!email) continue
    seen.add(email)
    entries.push({ email, role: u.role ?? "floor_manager" })
  }

  for (const rawEmail of adminEmails) {
    const email = rawEmail.toLowerCase().trim()
    if (!email || seen.has(email)) continue
    seen.add(email)
    entries.push({ email, role: "admin" })
  }

  for (const entry of entries) {
    await db.collection("allowedEmails").updateOne(
      { email: entry.email },
      {
        $setOnInsert: {
          email: entry.email,
          role: entry.role,
          addedAt: new Date(),
          addedByEmail: "system",
        },
      },
      { upsert: true }
    )
  }
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(): Promise<UserRow[]> {
  const docs = await getDb()
    .collection<UserDoc>("users")
    .find({}, { projection: { email: 1, name: 1, image: 1, role: 1 } })
    .sort({ email: 1 })
    .toArray()

  return docs.map((d) => ({
    _id: d._id,
    email: d.email ?? "",
    name: d.name ?? null,
    image: d.image ?? null,
    role: d.role ?? "floor_manager",
  }))
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  if (!ObjectId.isValid(userId)) return null
  const doc = await getDb()
    .collection<UserDoc>("users")
    .findOne(
      { _id: new ObjectId(userId) },
      { projection: { email: 1, name: 1, image: 1, role: 1 } }
    )
  if (!doc) return null
  return {
    _id: doc._id,
    email: doc.email ?? "",
    name: doc.name ?? null,
    image: doc.image ?? null,
    role: doc.role ?? "floor_manager",
  }
}

export async function updateUserRoleInDb(
  userId: string,
  role: Role
): Promise<void> {
  if (!ObjectId.isValid(userId)) return
  await getDb()
    .collection("users")
    .updateOne({ _id: new ObjectId(userId) }, { $set: { role } })
}

export async function deleteUserById(userId: string): Promise<void> {
  if (!ObjectId.isValid(userId)) return
  const db = getDb()
  const oid = new ObjectId(userId)
  await db.collection("users").deleteOne({ _id: oid })
  await db.collection("accounts").deleteMany({ userId: oid })
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function deleteSessionsByUserId(userId: string): Promise<void> {
  if (!ObjectId.isValid(userId)) return
  await getDb()
    .collection("sessions")
    .deleteMany({ userId: new ObjectId(userId) })
}

export async function getUserIdByEmail(
  email: string
): Promise<string | null> {
  const doc = await getDb()
    .collection<{ _id: ObjectId }>("users")
    .findOne(
      { email: email.toLowerCase().trim() },
      { projection: { _id: 1 } }
    )
  return doc ? doc._id.toString() : null
}
