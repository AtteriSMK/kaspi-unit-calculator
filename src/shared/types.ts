export type LogisticsType = 'city' | 'intercity' | 'express' | 'own'

export interface LogisticsRates {
  city: number
  intercity: number
  express: number
  own: number
}

export interface CalculatorInputs {
  costPrice: number
  commissionPct: number
  selectedLogisticsType: LogisticsType
  logistics: LogisticsRates
  drrPct: number
  sellerBonusPct: number
  reviewBonus: number
  taxPct: number
  packagingCost: number
  plannedSalePrice: number
  minCompetitorPrice: number | null
}

export interface CalculatorBreakdown {
  costPrice: number
  commissionAmount: number
  logisticsAmount: number
  marketingAmount: number
  sellerBonusAmount: number
  taxAmount: number
  packagingCost: number
  reviewBonus: number
  totalCosts: number
}

export interface CalculatorResult {
  profit: number
  marginPct: number
  markupPct: number
  roiPct: number
  breakevenPrice: number
  competitorDelta: number | null
  breakdown: CalculatorBreakdown
}

export interface ProductSnapshot {
  productId: string
  productName: string
  brand: string | null
  sellerName: string | null
  salePrice: number | null
  minCompetitorPrice: number | null
}

export interface HistoryEntry {
  lastUpdated: string
  productName: string
  inputs: CalculatorInputs
  result: CalculatorResult
}

export interface UserDefaults extends Omit<CalculatorInputs, 'plannedSalePrice' | 'minCompetitorPrice'> {
  autoShow: boolean
}
