// Pure functions. No I/O, no Mongo. Re-usable and trivially inspectable.

export function floorFromApartmentNumber(number: string): number {
  return Math.floor(parseInt(number, 10) / 100)
}

export function generateApartmentNumbers(opts: {
  total: number
  startingUnitNumber: number
  unitsPerFloor: number
}): { number: string; floor: number }[] {
  const { total, startingUnitNumber, unitsPerFloor } = opts
  const startingFloor = Math.floor(startingUnitNumber / 100)
  const startingPosition = startingUnitNumber % 100
  const result: { number: string; floor: number }[] = []
  for (let i = 0; i < total; i++) {
    const floor = startingFloor + Math.floor(i / unitsPerFloor)
    const position = startingPosition + (i % unitsPerFloor)
    const number = String(floor * 100 + position)
    result.push({ number, floor })
  }
  return result
}

export function generateParkingNumbers(opts: {
  total: number
  prefix: string
}): { number: string; floor: number }[] {
  const { total, prefix } = opts
  const result: { number: string; floor: number }[] = []
  for (let i = 0; i < total; i++) {
    const number = `${prefix}${String(i + 1).padStart(3, "0")}`
    result.push({ number, floor: 0 })
  }
  return result
}
