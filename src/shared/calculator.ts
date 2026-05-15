import type {
  CalculatorBreakdown,
  CalculatorInputs,
  CalculatorResult,
} from './types'

function safeRatio(numerator: number, denominator: number): number {
  if (denominator === 0) return Number.NaN
  return numerator / denominator
}

export function calculate(inputs: CalculatorInputs): CalculatorResult {
  const salePrice = inputs.plannedSalePrice
  const logisticsAmount = inputs.logistics[inputs.selectedLogisticsType]
  const commissionAmount = salePrice * (inputs.commissionPct / 100)
  const marketingAmount = salePrice * (inputs.drrPct / 100)
  const sellerBonusAmount = salePrice * (inputs.sellerBonusPct / 100)
  const taxAmount = salePrice * (inputs.taxPct / 100)

  const breakdown: CalculatorBreakdown = {
    costPrice: inputs.costPrice,
    commissionAmount,
    logisticsAmount,
    marketingAmount,
    sellerBonusAmount,
    taxAmount,
    packagingCost: inputs.packagingCost,
    reviewBonus: inputs.reviewBonus,
    totalCosts:
      inputs.costPrice +
      commissionAmount +
      logisticsAmount +
      marketingAmount +
      sellerBonusAmount +
      taxAmount +
      inputs.packagingCost +
      inputs.reviewBonus,
  }

  const profit = salePrice - breakdown.totalCosts
  const marginPct = safeRatio(profit, salePrice) * 100
  const markupPct = safeRatio(profit, inputs.costPrice) * 100
  const roiPct = safeRatio(profit, inputs.costPrice + inputs.packagingCost) * 100

  // Цена безубыточности.
  // profit = P · (1 − (commission+drr+sellerBonus+tax)/100) − (cost + logistics + packaging + reviewBonus)
  // profit = 0  =>  P = fixedCosts / (1 − pctSum/100)
  // Если pctSum >= 100 — безубыточной цены не существует (любая цена убыточна) → Infinity.
  const pctSum =
    inputs.commissionPct +
    inputs.drrPct +
    inputs.sellerBonusPct +
    inputs.taxPct
  const fixedCosts =
    inputs.costPrice + logisticsAmount + inputs.packagingCost + inputs.reviewBonus
  const denom = 1 - pctSum / 100
  const breakevenPrice = denom > 0 ? fixedCosts / denom : Number.POSITIVE_INFINITY

  const competitorDelta =
    inputs.minCompetitorPrice == null
      ? null
      : salePrice - inputs.minCompetitorPrice

  return {
    profit,
    marginPct,
    markupPct,
    roiPct,
    breakevenPrice,
    competitorDelta,
    breakdown,
  }
}
