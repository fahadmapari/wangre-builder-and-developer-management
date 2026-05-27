import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type {
  Project,
  Unit,
  UnitType,
  UnitStatus,
  ProjectStatus,
} from "./schemas"
import type { Paginated } from "@/lib/transactions/repository"
import {
  generateApartmentNumbers,
  generateParkingNumbers,
} from "./generation"

export async function listProjects(): Promise<Project[]> {
  const db = getDb()
  return db
    .collection<Project>("projects")
    .find({})
    .sort({ createdAt: -1 })
    .toArray()
}

export async function getProject(id: string): Promise<Project | null> {
  if (!ObjectId.isValid(id)) return null
  const db = getDb()
  return db
    .collection<Project>("projects")
    .findOne({ _id: new ObjectId(id) })
}

export async function countSoldUnits(projectId: ObjectId): Promise<number> {
  const db = getDb()
  return db
    .collection<Unit>("units")
    .countDocuments({ projectId, status: "sold" })
}

export type UnitFilters = {
  types: UnitType[]   // [] means "no filter"
  statuses: UnitStatus[]
}

export async function listUnitsForProject(
  projectId: ObjectId,
  filters: UnitFilters,
  page: number,
  pageSize: number,
): Promise<Paginated<Unit>> {
  const db = getDb()
  const query: Record<string, unknown> = { projectId }
  if (filters.types.length > 0) query.type = { $in: filters.types }
  if (filters.statuses.length > 0) query.status = { $in: filters.statuses }
  const skip = (page - 1) * pageSize
  const coll = db.collection<Unit>("units")
  const [rows, total] = await Promise.all([
    coll.find(query).sort({ floor: 1, number: 1 }).skip(skip).limit(pageSize).toArray(),
    coll.countDocuments(query),
  ])
  return { rows, total }
}

export async function createProjectWithUnits(
  input: {
    name: string
    location: string
    status: ProjectStatus
    totalUnits: number
    totalParkings: number
    notes?: string
    startingUnitNumber: number
    unitsPerFloor: number
    parkingPrefix: string
  },
  userId: string
): Promise<{ projectId: ObjectId }> {
  const createdBy = new ObjectId(userId)
  const session = client.startSession()
  try {
    let projectId!: ObjectId
    await session.withTransaction(async () => {
      const db = getDb()
      const projects = db.collection<Omit<Project, "_id">>("projects")
      const units = db.collection<Omit<Unit, "_id">>("units")
      const now = new Date()

      const projectDoc: Omit<Project, "_id"> = {
        name: input.name,
        location: input.location,
        status: input.status,
        totalUnits: input.totalUnits,
        totalParkings: input.totalParkings,
        notes: input.notes,
        createdBy,
        createdAt: now,
        updatedAt: now,
      }
      const projectResult = await projects.insertOne(projectDoc, { session })
      projectId = projectResult.insertedId

      const apartments: Omit<Unit, "_id">[] = generateApartmentNumbers({
        total: input.totalUnits,
        startingUnitNumber: input.startingUnitNumber,
        unitsPerFloor: input.unitsPerFloor,
      }).map((u) => ({
        projectId,
        type: "apartment" as UnitType,
        number: u.number,
        floor: u.floor,
        areaSqft: 0,
        salePrice: 0,
        status: "available",
        notes: "",
        createdBy,
        createdAt: now,
        updatedAt: now,
      }))

      const parkings: Omit<Unit, "_id">[] = generateParkingNumbers({
        total: input.totalParkings,
        prefix: input.parkingPrefix,
      }).map((p) => ({
        projectId,
        type: "parking" as UnitType,
        number: p.number,
        floor: p.floor,
        areaSqft: 0,
        salePrice: 0,
        status: "available",
        notes: "",
        createdBy,
        createdAt: now,
        updatedAt: now,
      }))

      if (apartments.length > 0)
        await units.insertMany(apartments, { session })
      if (parkings.length > 0) await units.insertMany(parkings, { session })
    })
    return { projectId }
  } finally {
    await session.endSession()
  }
}
