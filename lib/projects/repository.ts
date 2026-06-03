import { ObjectId } from "mongodb"
import client, { getDb } from "@/lib/db/client"
import type {
  Project,
  Unit,
  UnitType,
  UnitStatus,
  ProjectStatus,
  CapitalInjection,
} from "./schemas"
import type { Paginated } from "@/lib/transactions/repository"
import {
  generateApartmentNumbers,
  generateParkingNumbers,
} from "./generation"

export type ProjectFunds = {
  totalCapital: number
  totalRevenue: number
  totalSpent: number
  availableFunds: number
}

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
    initialCapital?: number
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
        startingUnitNumber: input.startingUnitNumber,
        unitsPerFloor: input.unitsPerFloor,
        parkingPrefix: input.parkingPrefix,
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

      if (input.initialCapital != null) {
        await db
          .collection<Omit<CapitalInjection, "_id">>("capitalInjections")
          .insertOne(
            {
              projectId,
              amount: input.initialCapital,
              occurredAt: now,
              createdBy,
              createdAt: now,
            },
            { session }
          )
      }
    })
    return { projectId }
  } finally {
    await session.endSession()
  }
}

export async function getProjectFunds(projectId: ObjectId): Promise<ProjectFunds> {
  const db = getDb()
  const [capitalResult, revenueResult, spentResult] = await Promise.all([
    db
      .collection<CapitalInjection>("capitalInjections")
      .aggregate<{ total: number }>([
        { $match: { projectId } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    db
      .collection("transactions")
      .aggregate<{ total: number }>([
        { $match: { projectId, kind: "income", voided: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    db
      .collection("transactions")
      .aggregate<{ total: number }>([
        { $match: { projectId, kind: "expense", voided: { $ne: true } } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $cond: [
                  { $ifNull: ["$reversalOf", false] },
                  { $multiply: ["$amount", -1] },
                  "$amount",
                ],
              },
            },
          },
        },
      ])
      .toArray(),
  ])
  const totalCapital = capitalResult[0]?.total ?? 0
  const totalRevenue = revenueResult[0]?.total ?? 0
  const totalSpent = spentResult[0]?.total ?? 0
  return { totalCapital, totalRevenue, totalSpent, availableFunds: totalCapital + totalRevenue - totalSpent }
}

export async function listCapitalInjections(
  projectId: ObjectId
): Promise<CapitalInjection[]> {
  const db = getDb()
  return db
    .collection<CapitalInjection>("capitalInjections")
    .find({ projectId })
    .sort({ occurredAt: -1 })
    .toArray()
}

export async function addCapitalInjection(
  input: {
    projectId: ObjectId
    amount: number
    notes: string
    occurredAt: Date
  },
  userId: string
): Promise<void> {
  const db = getDb()
  const doc: Omit<CapitalInjection, "_id"> = {
    projectId: input.projectId,
    amount: input.amount,
    occurredAt: input.occurredAt,
    createdBy: new ObjectId(userId),
    createdAt: new Date(),
  }
  if (input.notes) doc.notes = input.notes
  await db
    .collection<Omit<CapitalInjection, "_id">>("capitalInjections")
    .insertOne(doc)
}
