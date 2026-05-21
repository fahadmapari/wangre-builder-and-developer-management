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

// Phase 4 — materials catalog (global)
await db
  .collection("materials")
  .createIndex({ name: 1 }, { collation: { locale: "en", strength: 2 } })

// Phase 4 — per-project stock counter
await db
  .collection("projectMaterials")
  .createIndex({ projectId: 1, materialId: 1 }, { unique: true })
await db.collection("projectMaterials").createIndex({ projectId: 1 })

// Phase 4 — movement event log
await db
  .collection("materialMovements")
  .createIndex({ projectId: 1, materialId: 1, occurredAt: -1 })
await db
  .collection("materialMovements")
  .createIndex({ projectId: 1, kind: 1, voided: 1 })
await db
  .collection("materialMovements")
  .createIndex({ transactionId: 1 }, { sparse: true })

// Phase 5 — reversal linkage on transactions
await db
  .collection("transactions")
  .createIndex({ reversalOf: 1 }, { sparse: true })

// Phase 6 — transfer pair linkage
await db
  .collection("transactions")
  .createIndex({ transferGroupId: 1 }, { sparse: true })
await db
  .collection("materialMovements")
  .createIndex({ transferGroupId: 1 }, { sparse: true })
await db
  .collection("materialMovements")
  .createIndex({ reversalOf: 1 }, { sparse: true })

// Phase 8 — ledger text search
await db
  .collection("transactions")
  .createIndex(
    { description: "text", buyerName: "text", notes: "text" },
    {
      name: "transactions_text",
      weights: { description: 10, buyerName: 5, notes: 1 },
      default_language: "english",
    },
  )

console.log(
  "Indexes ensured: users.email (unique); " +
    "projects.createdAt, projects.name; " +
    "units.(projectId,type,status), units.(projectId,type,number) unique, units.(status,soldAt); " +
    "transactions.(projectId,occurredAt), transactions.(projectId,kind,voided), transactions.(unitId,voided), transactions.reversalOf sparse; " +
    "materials.name (case-insensitive); " +
    "projectMaterials.(projectId,materialId) unique, projectMaterials.(projectId); " +
    "materialMovements.(projectId,materialId,occurredAt), materialMovements.(projectId,kind,voided), materialMovements.(transactionId) sparse" +
    "; transactions.transferGroupId sparse; " +
    "materialMovements.reversalOf sparse, materialMovements.transferGroupId sparse; " +
    "transactions_text (description weight=10, buyerName=5, notes=1)"
)

await client.close()
