import type { LogisticsRates, LogisticsType, UserDefaults } from './types'

export const STORAGE_KEYS = {
  userDefaults: 'kaspi_calc_defaults',
  history: 'kaspi_calc_history',
  hiddenProducts: 'kaspi_calc_hidden',
} as const

export const HISTORY_LIMIT = 500

export const REVIEW_BONUS_MAX = 5_000

export const OUR_SELLER_NAME = 'Официальный дистрибьютор Keep Looking Distribution'

export const DEFAULT_USER_SETTINGS: UserDefaults = {
  costPrice: 0,
  commissionPct: 12,
  selectedLogisticsType: 'city',
  // Тарифы Kaspi с 01.01.2026, заказ ≥10 000 ₸, вес до 5 кг, с НДС 12%.
  logistics: {
    city: 1_231,       // 1 099,14 × 1.12
    intercity: 1_455,  // 1 299,14 × 1.12
    express: 1_903,    // 1 699,14 × 1.12
    own: 0,
  },
  drrPct: 0,
  sellerBonusPct: 0,
  reviewBonus: 0,
  taxPct: 4,
  packagingCost: 0,
  autoShow: true,
}

/**
 * Тарифная сетка Kaspi для заказов до 10 000 ₸ (с 01.01.2026, с НДС 12%).
 * [maxOrderAmount, city, intercity, express]
 */
const PRICE_LOGISTICS_TIERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1_000, 55, 55, 55],        // ≤1 000 ₸ → 49,14 × 1.12
  [3_000, 167, 167, 167],     // 1 001–3 000 ₸ → 149,14 × 1.12
  [5_000, 223, 223, 223],     // 3 001–5 000 ₸ → 199,14 × 1.12
  [9_999, 783, 895, 895],     // 5 001–9 999 ₸ → city 699,14 / intercity+express 799,14
]

/**
 * Возвращает тариф логистики Kaspi исходя из суммы заказа.
 * Для заказов ≥10 000 ₸ тариф весовой — берём из настроек пользователя (fallback).
 */
export function kaspiLogisticsRate(
  orderAmount: number,
  type: LogisticsType,
  fallback: LogisticsRates,
): number {
  if (type === 'own') return 0
  if (orderAmount <= 0) return fallback[type]

  const tier = PRICE_LOGISTICS_TIERS.find(([max]) => orderAmount <= max)
  if (!tier) return fallback[type] // ≥10 000 ₸ → весовой тариф из popup

  const [, city, intercity, express] = tier
  if (type === 'city') return city
  if (type === 'intercity') return intercity
  return express
}
