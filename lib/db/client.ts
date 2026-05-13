import { MongoClient, ServerApiVersion, type Db } from "mongodb"

if (!process.env.MONGODB_URI) {
  throw new Error('Missing env "MONGODB_URI"')
}

const uri = process.env.MONGODB_URI
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
  if (!process.env.MONGODB_DB) {
    throw new Error('Missing env "MONGODB_DB"')
  }
  return client.db(process.env.MONGODB_DB)
}
