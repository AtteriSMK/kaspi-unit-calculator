import { describe, expect, it } from 'vitest'
import { calculate } from './calculator'
import type { CalculatorInputs } from './types'

const baseInputs: CalculatorInputs = {
  costPrice: 3_000,
  commissionPct: 12,
  selectedLogisticsType: 'city',
  logistics: { city: 799, intercity: 1_199, express: 1_599, own: 0 },
  drrPct: 0,
  sellerBonusPct: 0,
  reviewBonus: 0,
  taxPct: 4,
  packagingCost: 0,
  plannedSalePrice: 6_000,
  minCompetitorPrice: null,
}

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

describe('calculate — happy path', () => {
  it('считает прибыль на базовом сценарии (12% комиссия, 4% налог, логистика 799 ₸)', () => {
    const r = calculate(baseInputs)
    // commission = 6000 * 0.12 = 720
    // tax        = 6000 * 0.04 = 240
    // logistics  = 799
    // costs      = 3000 + 720 + 240 + 799 = 4759
    // profit     = 6000 - 4759 = 1241
    expect(r.profit).toBe(1_241)
    expect(close(r.marginPct, (1_241 / 6_000) * 100)).toBe(true)
    expect(close(r.markupPct, (1_241 / 3_000) * 100)).toBe(true)
    expect(close(r.roiPct, (1_241 / 3_000) * 100)).toBe(true)
  })

  it('breakdown отражает все компоненты расходов', () => {
    const r = calculate(baseInputs)
    expect(r.breakdown).toMatchObject({
      costPrice: 3_000,
      commissionAmount: 720,
      logisticsAmount: 799,
      marketingAmount: 0,
      sellerBonusAmount: 0,
      taxAmount: 240,
      packagingCost: 0,
      reviewBonus: 0,
      totalCosts: 4_759,
    })
  })
})

describe('calculate — убыток и нулевые поля', () => {
  it('возвращает отрицательную прибыль, если цена ниже себестоимости + комиссий', () => {
    const r = calculate({ ...baseInputs, plannedSalePrice: 2_000 })
    expect(r.profit).toBeLessThan(0)
    expect(r.marginPct).toBeLessThan(0)
  })

  it('опциональные поля по нулям не ломают расчёт', () => {
    const r = calculate({
      ...baseInputs,
      drrPct: 0,
      sellerBonusPct: 0,
      reviewBonus: 0,
      packagingCost: 0,
    })
    expect(Number.isFinite(r.profit)).toBe(true)
    expect(r.breakdown.marketingAmount).toBe(0)
    expect(r.breakdown.sellerBonusAmount).toBe(0)
  })
})

describe('calculate — экстремальные значения', () => {
  it('costPrice = 0 даёт NaN для markupPct и roiPct, но profit считается', () => {
    const r = calculate({ ...baseInputs, costPrice: 0, packagingCost: 0 })
    expect(Number.isFinite(r.profit)).toBe(true)
    expect(Number.isNaN(r.markupPct)).toBe(true)
    expect(Number.isNaN(r.roiPct)).toBe(true)
  })

  it('salePrice = 0 даёт NaN для marginPct', () => {
    const r = calculate({ ...baseInputs, plannedSalePrice: 0 })
    expect(Number.isNaN(r.marginPct)).toBe(true)
  })

  it('100% комиссия гарантирует убыток и Infinity breakeven', () => {
    const r = calculate({ ...baseInputs, commissionPct: 100, taxPct: 0 })
    expect(r.profit).toBeLessThan(0)
    expect(r.breakevenPrice).toBe(Number.POSITIVE_INFINITY)
  })

  it('сумма процентов > 100 — breakeven Infinity (структурно убыточная конфигурация)', () => {
    const r = calculate({
      ...baseInputs,
      commissionPct: 60,
      taxPct: 4,
      drrPct: 30,
      sellerBonusPct: 10, // итого 104%
    })
    expect(r.breakevenPrice).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('calculate — логистика', () => {
  it('переключение типа логистики меняет logisticsAmount', () => {
    const city = calculate({ ...baseInputs, selectedLogisticsType: 'city' })
    const intercity = calculate({ ...baseInputs, selectedLogisticsType: 'intercity' })
    const express = calculate({ ...baseInputs, selectedLogisticsType: 'express' })
    const own = calculate({
      ...baseInputs,
      selectedLogisticsType: 'own',
      logistics: { ...baseInputs.logistics, own: 0 },
    })
    expect(city.breakdown.logisticsAmount).toBe(799)
    expect(intercity.breakdown.logisticsAmount).toBe(1_199)
    expect(express.breakdown.logisticsAmount).toBe(1_599)
    expect(own.breakdown.logisticsAmount).toBe(0)
    // Дороже логистика → меньше прибыль.
    expect(city.profit).toBeGreaterThan(express.profit)
  })
})

describe('calculate — бонусы и упаковка', () => {
  it('бонус за отзыв уменьшает прибыль ровно на свою сумму', () => {
    const without = calculate(baseInputs)
    const withBonus = calculate({ ...baseInputs, reviewBonus: 500 })
    expect(without.profit - withBonus.profit).toBe(500)
    expect(withBonus.breakdown.reviewBonus).toBe(500)
  })

  it('расходы на упаковку входят в roiPct (в знаменатель)', () => {
    const without = calculate({ ...baseInputs, packagingCost: 0 })
    const withPack = calculate({ ...baseInputs, packagingCost: 200 })
    // ROI знаменатель растёт → ROI падает (при условии что profit > 0 в обоих).
    expect(withPack.roiPct).toBeLessThan(without.roiPct)
    expect(withPack.profit).toBe(without.profit - 200)
  })

  it('бонус продавца % считается от цены продажи', () => {
    const r = calculate({ ...baseInputs, sellerBonusPct: 5, plannedSalePrice: 10_000 })
    expect(r.breakdown.sellerBonusAmount).toBe(500)
  })
})

describe('calculate — breakeven', () => {
  it('при breakeven-цене profit ≈ 0', () => {
    const inputs: CalculatorInputs = {
      ...baseInputs,
      drrPct: 5,
      sellerBonusPct: 2,
      packagingCost: 100,
      reviewBonus: 200,
    }
    const probe = calculate(inputs)
    const atBreakeven = calculate({ ...inputs, plannedSalePrice: probe.breakevenPrice })
    expect(close(atBreakeven.profit, 0, 1e-6)).toBe(true)
  })
})

describe('calculate — конкурент', () => {
  it('competitorDelta = null если minCompetitorPrice не указан', () => {
    const r = calculate({ ...baseInputs, minCompetitorPrice: null })
    expect(r.competitorDelta).toBeNull()
  })

  it('competitorDelta > 0 когда мы дороже конкурента', () => {
    const r = calculate({
      ...baseInputs,
      plannedSalePrice: 6_500,
      minCompetitorPrice: 6_000,
    })
    expect(r.competitorDelta).toBe(500)
  })

  it('competitorDelta < 0 когда мы дешевле конкурента', () => {
    const r = calculate({
      ...baseInputs,
      plannedSalePrice: 5_500,
      minCompetitorPrice: 6_000,
    })
    expect(r.competitorDelta).toBe(-500)
  })
})
