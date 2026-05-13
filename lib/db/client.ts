import { MongoClient, ServerApiVersion, type Db } from "mongodb"

if (!process.env.MONGODB_URI) {
  throw new Error('Missing env "MONGODB_URI"')
}
if (!process.env.MONGODB_DB) {
  throw new Error('Missing env "MONGODB_DB"')
}

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
}

let client: MongoClient

if (process.env.NODE_ENV === "development") {
  const globalWithMongo = global as typeof globalThis & {
    _mongoClient?: MongoClient
  }
  if (!globalWithMongo._mongoClient) {
    globalWithMongo._mongoClient = new MongoClient(uri, options)
  }
  client = globalWithMongo._mongoClient
} else {
  client = new MongoClient(uri, options)
}

export default client

export function getDb(): Db {
  return client.db(dbName)
}
