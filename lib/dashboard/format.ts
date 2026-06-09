// Pure INR formatters. No DB, no React. Safe to import from client components.

const INR = new Intl.NumberFormat("en-IN")

/** Full amount, e.g. "₹12,34,567" or "−₹4,500". */
export function formatINR(n: number): string {
  return `${n < 0 ? "−" : ""}₹${INR.format(Math.abs(Math.round(n)))}`
}

function trim(x: number): string {
  return (Math.round(x * 10) / 10).toString()
}

/** Compact INR for axis ticks: ₹1.2Cr / ₹45L / ₹3.4K / ₹900. */
export function formatINRCompact(n: number): string {
  const sign = n < 0 ? "−" : ""
  const a = Math.abs(n)
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`
  return `${sign}₹${Math.round(a)}`
}
