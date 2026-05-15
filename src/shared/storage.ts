/**
 * Обёртка над chrome.storage.
 *  - sync: дефолты пользователя (синк между девайсами)
 *  - local: история по product_id, скрытые карточки
 */

import { DEFAULT_USER_SETTINGS, HISTORY_LIMIT, STORAGE_KEYS } from './constants'
import type {
  CalculatorInputs,
  CalculatorResult,
  HistoryEntry,
  UserDefaults,
} from './types'

// ─── Defaults (sync) ────────────────────────────────────────────────

export async function getUserDefaults(): Promise<UserDefaults> {
  const data = await chrome.storage.sync.get(STORAGE_KEYS.userDefaults)
  const stored = data[STORAGE_KEYS.userDefaults] as Partial<UserDefaults> | undefined
  return { ...DEFAULT_USER_SETTINGS, ...stored }
}

export async function setUserDefaults(defaults: UserDefaults): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.userDefaults]: defaults })
}

export async function resetUserDefaults(): Promise<UserDefaults> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.userDefaults]: DEFAULT_USER_SETTINGS })
  return DEFAULT_USER_SETTINGS
}

// ─── History (local) ────────────────────────────────────────────────

type HistoryMap = Record<string, HistoryEntry>

async function readHistory(): Promise<HistoryMap> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.history)
  return (data[STORAGE_KEYS.history] as HistoryMap) ?? {}
}

async function writeHistory(map: HistoryMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: map })
}

export async function getHistoryEntry(
  productId: string,
): Promise<HistoryEntry | null> {
  const map = await readHistory()
  return map[productId] ?? null
}

export async function saveHistoryEntry(
  productId: string,
  productName: string,
  inputs: CalculatorInputs,
  result: CalculatorResult,
): Promise<void> {
  const map = await readHistory()
  map[productId] = {
    lastUpdated: new Date().toISOString(),
    productName,
    inputs,
    result,
  }

  // Вытеснение по LRU (lastUpdated), если превысили лимит.
  const ids = Object.keys(map)
  if (ids.length > HISTORY_LIMIT) {
    const sorted = ids
      .map((id) => [id, map[id]!.lastUpdated] as const)
      .sort(([, a], [, b]) => a.localeCompare(b))
    const toRemove = sorted.slice(0, ids.length - HISTORY_LIMIT)
    for (const [id] of toRemove) delete map[id]
  }

  await writeHistory(map)
}

// ─── Hidden products (local) ────────────────────────────────────────

type HiddenSet = Record<string, true>

async function readHidden(): Promise<HiddenSet> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.hiddenProducts)
  return (data[STORAGE_KEYS.hiddenProducts] as HiddenSet) ?? {}
}

export async function isHidden(productId: string): Promise<boolean> {
  const set = await readHidden()
  return set[productId] === true
}

export async function markHidden(productId: string): Promise<void> {
  const set = await readHidden()
  set[productId] = true
  await chrome.storage.local.set({ [STORAGE_KEYS.hiddenProducts]: set })
}

export async function unmarkHidden(productId: string): Promise<void> {
  const set = await readHidden()
  delete set[productId]
  await chrome.storage.local.set({ [STORAGE_KEYS.hiddenProducts]: set })
}
