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

await db.collection("users").createIndex({ email: 1 }, { unique: true })
console.log("Indexes ensured: users.email (unique)")

await client.close()
