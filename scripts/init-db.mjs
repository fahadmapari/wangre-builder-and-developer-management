import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB
if (!uri || !dbName) {
  console.error("Set MONGODB_URI and MONGODB_DB before running.")
  process.exit(1)
}

const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbName)

// Phase 1
await db.collection("users").createIndex({ email: 1 }, { unique: true })

// Phase 2 — projects
await db.collection("projects").createIndex({ createdAt: -1 })
await db.collection("projects").createIndex({ name: 1 })

// Phase 2 — units (one collection, type discriminator)
await db.collection("units").createIndex({ projectId: 1, type: 1, status: 1 })
await db
  .collection("units")
  .createIndex({ projectId: 1, type: 1, number: 1 }, { unique: true })
await db.collection("units").createIndex({ status: 1, soldAt: -1 })

// Phase 3 — transactions (append-only with soft-void)
await db
  .collection("transactions")
  .createIndex({ projectId: 1, occurredAt: -1 })
await db
  .collection("transactions")
  .createIndex({ projectId: 1, kind: 1, voided: 1 })
await db
  .collection("transactions")
  .createIndex({ unitId: 1, voided: 1 })

console.log(
  "Indexes ensured: users.email (unique); projects.createdAt, projects.name; " +
    "units.(projectId,type,status), units.(projectId,type,number) unique, units.(status,soldAt); " +
    "transactions.(projectId,occurredAt), transactions.(projectId,kind,voided), transactions.(unitId,voided)"
)

await client.close()
