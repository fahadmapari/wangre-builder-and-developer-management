// Pure functions. No I/O, no Mongo. Re-usable and trivially inspectable.

export function floorFromApartmentNumber(number: string): number {
  return Math.floor(parseInt(number, 10) / 100)
}

export function generateApartmentNumbers(opts: {
  total: number
  startingUnitNumber: number
  unitsPerFloor: number
  /** Index of the first unit to generate in the overall sequence (default 0).
   *  Pass `project.totalUnits` when expanding an existing project so that
   *  continuation unit numbers match what createProject would have produced
   *  had `totalUnits` been higher at creation time. */
  startOffset?: number
}): { number: string; floor: number }[] {
  const { total, startingUnitNumber, unitsPerFloor, startOffset = 0 } = opts
  const startingFloor = Math.floor(startingUnitNumber / 100)
  const startingPosition = startingUnitNumber % 100
  const result: { number: string; floor: number }[] = []
  for (let i = 0; i < total; i++) {
    const seq = startOffset + i
    const floor = startingFloor + Math.floor(seq / unitsPerFloor)
    const position = startingPosition + (seq % unitsPerFloor)
    const number = String(floor * 100 + position)
    result.push({ number, floor })
  }
  return result
}

export function generateParkingNumbers(opts: {
  total: number
  prefix: string
  /** Starting counter value (1-based). Pass `project.totalParkings + 1` when
   *  expanding an existing project so numbers continue from where they left
   *  off (e.g. existing has P001–P003, startFrom=4 → P004, P005…). */
  startFrom?: number
}): { number: string; floor: number }[] {
  const { total, prefix, startFrom = 1 } = opts
  const result: { number: string; floor: number }[] = []
  for (let i = 0; i < total; i++) {
    const number = `${prefix}${String(startFrom + i).padStart(3, "0")}`
    result.push({ number, floor: 0 })
  }
  return result
}
