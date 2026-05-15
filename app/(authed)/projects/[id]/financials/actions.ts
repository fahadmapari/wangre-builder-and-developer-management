"use server"

import { ObjectId } from "mongodb"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth/session"
import type { ActionResult } from "@/lib/projects/schemas"
import type { Transaction } from "@/lib/transactions/schemas"
import {
  CreateAdhocIncomeInputSchema,
  CreateAdhocExpenseInputSchema,
  VoidTransactionInputSchema,
  ReverseTransactionInputSchema,
} from "@/lib/transactions/schemas"
import {
  voidTransaction as voidTransactionRepo,
  reverseTransaction as reverseTransactionRepo,
  TransactionNotFoundError,
  CannotReverseError,
} from "@/lib/transactions/repository"
import client, { getDb } from "@/lib/db/client"

function fieldError(parsed: { success: false; error: any }) {
  const first = parsed.error.issues?.[0]
  return {
    error: first?.message ?? "Invalid input",
    field: (first?.path?.join(".") || undefined) as string | undefined,
  }
}

export async function createAdhocIncome(
  raw: unknown
): Promise<ActionResult<{ transactionId: string }>> {
  const user = await requireAdmin()
  const parsed = CreateAdhocIncomeInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { projectId, amount, occurredAt, description, buyerName, notes } =
    parsed.data
  if (!ObjectId.isValid(projectId)) {
    return { ok: false, error: "Invalid project id." }
  }

  try {
    const now = new Date()
    const doc: Omit<Transaction, "_id"> = {
      projectId: new ObjectId(projectId),
      unitId: null,
      kind: "income",
      category: "adhoc",
      amount,
      currency: "INR",
      description,
      occurredAt,
      buyerName: buyerName || undefined,
      notes: notes || undefined,
      createdBy: new ObjectId(user.id),
      createdAt: now,
    }
    const db = getDb()
    const res = await db
      .collection<Omit<Transaction, "_id">>("transactions")
      .insertOne(doc)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/financials")
    return { ok: true, data: { transactionId: res.insertedId.toHexString() } }
  } catch (err) {
    console.error("createAdhocIncome failed", err)
    return {
      ok: false,
      error: "Could not create income entry. Please try again.",
    }
  }
}

export async function createAdhocExpense(
  raw: unknown
): Promise<ActionResult<{ transactionId: string }>> {
  const user = await requireAdmin()
  const parsed = CreateAdhocExpenseInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { projectId, amount, occurredAt, description, notes } = parsed.data
  if (!ObjectId.isValid(projectId)) {
    return { ok: false, error: "Invalid project id." }
  }

  try {
    const now = new Date()
    const doc: Omit<Transaction, "_id"> = {
      projectId: new ObjectId(projectId),
      unitId: null,
      kind: "expense",
      category: "adhoc",
      amount,
      currency: "INR",
      description,
      occurredAt,
      notes: notes || undefined,
      createdBy: new ObjectId(user.id),
      createdAt: now,
    }
    const db = getDb()
    const res = await db
      .collection<Omit<Transaction, "_id">>("transactions")
      .insertOne(doc)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath("/financials")
    return { ok: true, data: { transactionId: res.insertedId.toHexString() } }
  } catch (err) {
    console.error("createAdhocExpense failed", err)
    return {
      ok: false,
      error: "Could not create expense entry. Please try again.",
    }
  }
}

export async function voidTransaction(
  raw: unknown
): Promise<ActionResult<{ voided: boolean }>> {
  const user = await requireAdmin()
  const parsed = VoidTransactionInputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: "Invalid input" }

  const { transactionId } = parsed.data
  if (!ObjectId.isValid(transactionId)) {
    return { ok: false, error: "Invalid transaction id." }
  }

  // Look up projectId for revalidate. Single read is fine — voidTransaction
  // is admin-only and infrequent.
  const db = getDb()
  const existing = await db
    .collection<Transaction>("transactions")
    .findOne(
      { _id: new ObjectId(transactionId) },
      { projection: { projectId: 1 } }
    )
  if (!existing) return { ok: false, error: "Transaction not found." }

  try {
    await voidTransactionRepo(new ObjectId(transactionId), user.id)
    revalidatePath(`/projects/${existing.projectId.toHexString()}`)
    revalidatePath("/financials")
    return { ok: true, data: { voided: true } }
  } catch (err) {
    if (err instanceof TransactionNotFoundError) {
      return { ok: false, error: err.message }
    }
    console.error("voidTransaction failed", err)
    return {
      ok: false,
      error: "Could not void transaction. Please try again.",
    }
  }
}

const CANNOT_REVERSE_MESSAGES: Record<string, string> = {
  "not-found": "Transaction not found.",
  "is-voided": "Cannot reverse a voided transaction.",
  "is-reversal": "Cannot reverse a reversal entry.",
  "is-transfer":
    "Transfer entries must be reversed via the inter-project transfer flow (Phase 6).",
}

export async function reverseTransaction(
  raw: unknown
): Promise<ActionResult<{ reversalId: string }>> {
  const user = await requireAdmin()
  const parsed = ReverseTransactionInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fe = fieldError(parsed)
    return { ok: false, error: fe.error, field: fe.field }
  }

  const { transactionId, occurredAt, notes } = parsed.data
  if (!ObjectId.isValid(transactionId)) {
    return { ok: false, error: "Invalid transaction id." }
  }

  // Look up projectId for revalidate (the original carries it).
  const db = getDb()
  const existing = await db
    .collection<Transaction>("transactions")
    .findOne(
      { _id: new ObjectId(transactionId) },
      { projection: { projectId: 1 } }
    )
  if (!existing) return { ok: false, error: "Transaction not found." }

  try {
    const { reversalId } = await reverseTransactionRepo(
      new ObjectId(transactionId),
      { occurredAt, notes },
      user.id
    )
    revalidatePath(`/projects/${existing.projectId.toHexString()}`)
    revalidatePath("/financials")
    return { ok: true, data: { reversalId: reversalId.toHexString() } }
  } catch (err) {
    if (err instanceof CannotReverseError) {
      return {
        ok: false,
        error:
          CANNOT_REVERSE_MESSAGES[err.reason] ??
          "Cannot reverse this transaction.",
      }
    }
    console.error("reverseTransaction failed", err)
    return {
      ok: false,
      error: "Could not reverse transaction. Please try again.",
    }
  }
}
