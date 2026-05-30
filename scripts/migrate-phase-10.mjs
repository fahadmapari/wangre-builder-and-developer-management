// Phase 10 — One-time migration.
//
// Backfills startingUnitNumber / unitsPerFloor / parkingPrefix onto existing
// Project docs by inferring them from existing unit numbering. Idempotent:
// only processes projects missing `startingUnitNumber`.
//
// Does NOT backfill lastUpdatedBy / lastUpdatedAt. Pre-Phase-10 docs stay
// quiet in the audit log by design.
//
// Run: node --env-file-if-exists=.env scripts/migrate-phase-10.mjs

import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error("MONGODB_URI not set")
  process.exit(1)
}

const client = new MongoClient(uri, {
  serverApi: { version: "1", strict: false, deprecationErrors: true },
})

async function main() {
  await client.connect()
  const db = client.db()
  const projects = db.collection("projects")
  const units = db.collection("units")

  const targets = await projects
    .find({ startingUnitNumber: { $exists: false } })
    .toArray()

  console.log(`Found ${targets.length} project(s) missing numbering params.`)

  let migrated = 0
  let skipped = 0

  for (const p of targets) {
    const apartments = await units
      .find({ projectId: p._id, type: "apartment" })
      .sort({ number: 1 })
      .toArray()
    const parkings = await units
      .find({ projectId: p._id, type: "parking" })
      .sort({ number: 1 })
      .toArray()

    let startingUnitNumber = 101
    let unitsPerFloor = 4
    if (apartments.length > 0) {
      // Parse numeric form of apartment number.
      const nums = apartments
        .map((u) => parseInt(u.number, 10))
        .filter((n) => Number.isFinite(n))
      if (nums.length === 0) {
        console.warn(
          `  ! Project ${p._id} has apartments but no numeric numbers — skipping.`
        )
        skipped++
        continue
      }
      nums.sort((a, b) => a - b)
      startingUnitNumber = nums[0]
      // Infer unitsPerFloor: count how many apartments share the lowest floor.
      // Floor = Math.floor(n / 100). Position within floor = n % 100.
      const lowestFloor = Math.floor(nums[0] / 100)
      const lowestFloorCount = nums.filter(
        (n) => Math.floor(n / 100) === lowestFloor
      ).length
      // Clamp to schema range (1-9).
      unitsPerFloor = Math.max(1, Math.min(9, lowestFloorCount))
    }

    let parkingPrefix = "P"
    if (parkings.length > 0) {
      const first = parkings[0].number
      const m = first.match(/^([^\d]+)/)
      if (m && m[1]) parkingPrefix = m[1]
    }

    await projects.updateOne(
      { _id: p._id },
      {
        $set: {
          startingUnitNumber,
          unitsPerFloor,
          parkingPrefix,
        },
      }
    )
    migrated++
    console.log(
      `  ✓ ${p.name}: startingUnitNumber=${startingUnitNumber}, unitsPerFloor=${unitsPerFloor}, parkingPrefix=${parkingPrefix}`
    )
  }

  console.log(`\nMigrated ${migrated} project(s); skipped ${skipped}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => client.close())
