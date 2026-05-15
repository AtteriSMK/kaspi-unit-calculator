/**
 * Custom element <kaspi-unit-calc> с Shadow DOM.
 *
 * Снаружи:
 *  - setSnapshot(snapshot): подставить цену и мин-конкурента из парсера
 *  - setDefaults(defaults): применить дефолты пользователя (только если истории нет)
 *  - setHistory(entry): восстановить сохранённый расчёт по этому товару
 *  - addEventListener('close', ...): пользователь нажал X
 *  - addEventListener('change', ...): расчёт обновился (для дебаунс-сейва)
 *
 * Real-time recalc: 150 мс debounce на любые изменения инпутов.
 */

import { calculate } from '../shared/calculator'
import { DEFAULT_USER_SETTINGS, kaspiLogisticsRate, REVIEW_BONUS_MAX } from '../shared/constants'
import type {
  CalculatorInputs,
  CalculatorResult,
  HistoryEntry,
  LogisticsType,
  ProductSnapshot,
  UserDefaults,
} from '../shared/types'
import calculatorCss from '../styles/calculator.css?inline'

const fmtMoney = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })
const fmtPercent = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const formatMoney = (n: number): string => {
  if (!Number.isFinite(n)) return '—'
  return `${fmtMoney.format(Math.round(n))} ₸`
}

const formatPercent = (n: number): string => {
  if (!Number.isFinite(n)) return '—'
  return `${fmtPercent.format(n)} %`
}

const LOGISTICS_LABELS: Record<LogisticsType, string> = {
  city: 'По городу',
  intercity: 'Межгород',
  express: 'Express',
  own: 'Своя доставка',
}

const TEMPLATE_HTML = /* html */ `
<div class="root is-expanded">
  <div class="header" data-role="toggle-header">
    <span class="header__title">Unit-калькулятор</span>
    <span class="header__chip" data-role="chip-profit">—</span>
    <span class="header__icon _toggle" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M2 4l4 4 4-4z"/></svg>
    </span>
    <span class="header__icon _close" data-role="close" title="Скрыть калькулятор на этой странице">
      <svg width="12" height="12" viewBox="0 0 12 12"><path fill="currentColor" d="M9.2 2.1L6 5.3 2.8 2.1 2.1 2.8 5.3 6 2.1 9.2l.7.7L6 6.7l3.2 3.2.7-.7L6.7 6l3.2-3.2z"/></svg>
    </span>
  </div>
  <div class="body">
    <div class="body__inner">
      <div class="body__content">

        <div class="section-label">Цены</div>
        <div class="field">
          <label class="field__label" for="plannedSalePrice">Цена продажи, ₸</label>
          <input class="field__input" id="plannedSalePrice" type="number" min="0" step="1" inputmode="decimal" />
        </div>
        <div class="field">
          <label class="field__label" for="minCompetitorPrice">Мин. конкурент, ₸</label>
          <input class="field__input _readonly" id="minCompetitorPrice" type="number" readonly />
        </div>

        <div class="divider"></div>

        <div class="section-label">Себестоимость</div>
        <div class="field">
          <label class="field__label" for="costPrice">Себестоимость, ₸</label>
          <input class="field__input" id="costPrice" type="number" min="0" step="1" inputmode="decimal" />
        </div>
        <div class="field">
          <label class="field__label" for="packagingCost">Упаковка, ₸</label>
          <input class="field__input" id="packagingCost" type="number" min="0" step="1" inputmode="decimal" />
        </div>

        <div class="divider"></div>

        <div class="section-label">Комиссии Kaspi</div>
        <div class="field">
          <label class="field__label" for="commissionPct">Комиссия с НДС, %</label>
          <input class="field__input" id="commissionPct" type="number" min="0" max="100" step="0.1" inputmode="decimal" />
        </div>
        <div class="field">
          <label class="field__label" for="selectedLogisticsType">Тип логистики</label>
          <select class="field__select" id="selectedLogisticsType">
            <option value="city">По городу</option>
            <option value="intercity">Межгород</option>
            <option value="express">Express</option>
            <option value="own">Своя доставка</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="logisticsRate"><span data-role="logistics-label">Логистика</span>, ₸</label>
          <input class="field__input" id="logisticsRate" type="number" min="0" step="1" inputmode="decimal" />
        </div>

        <div class="divider"></div>

        <div class="section-label">Маркетинг и бонусы</div>
        <div class="field">
          <label class="field__label" for="drrPct">ДРР, %</label>
          <input class="field__input" id="drrPct" type="number" min="0" max="100" step="0.1" inputmode="decimal" />
        </div>
        <div class="field">
          <label class="field__label" for="sellerBonusPct">Бонус продавца, %</label>
          <input class="field__input" id="sellerBonusPct" type="number" min="0" max="100" step="0.1" inputmode="decimal" />
        </div>
        <div class="field">
          <label class="field__label" for="reviewBonus">Бонус за отзыв, ₸</label>
          <input class="field__input" id="reviewBonus" type="number" min="0" max="${REVIEW_BONUS_MAX}" step="100" inputmode="decimal" />
        </div>

        <div class="divider"></div>

        <div class="section-label">Налог</div>
        <div class="field">
          <label class="field__label" for="taxPct">Налог, %</label>
          <input class="field__input" id="taxPct" type="number" min="0" max="100" step="0.1" inputmode="decimal" />
        </div>

        <div class="result">
          <div class="result__profit">
            <span class="result__profit-label">Прибыль</span>
            <span class="result__profit-value" data-role="profit">—</span>
          </div>
          <div class="metric">
            <span class="metric__label">Маржа</span>
            <span class="metric__value" data-role="margin">—</span>
          </div>
          <div class="metric">
            <span class="metric__label">Наценка</span>
            <span class="metric__value" data-role="markup">—</span>
          </div>
          <div class="metric">
            <span class="metric__label">ROI</span>
            <span class="metric__value" data-role="roi">—</span>
          </div>
          <div class="metric">
            <span class="metric__label">Цена безубыточности</span>
            <span class="metric__value" data-role="breakeven">—</span>
          </div>
          <div class="metric">
            <span class="metric__label">Δ к конкуренту</span>
            <span class="metric__value" data-role="competitor-delta">—</span>
          </div>
        </div>

      </div>
      <div class="footer">
        <div class="footer__line">Сверьте комиссию и тариф логистики в кабинете Kaspi.</div>
        <div class="footer__line">
          Поддержка:
          <a class="footer__link" href="https://t.me/atterismk" target="_blank" rel="noopener noreferrer">t.me/atterismk</a>
        </div>
        <div class="footer__line">
          Скачать фото из карточки:
          <a class="footer__link" href="https://kscon.kz/" target="_blank" rel="noopener noreferrer">kscon.kz</a>
          <span class="footer__sep">·</span>
          <a class="footer__link" href="https://t.me/ksp_helperbot" target="_blank" rel="noopener noreferrer">t.me/ksp_helperbot</a>
        </div>
      </div>
    </div>
  </div>
</div>
`

const INPUT_IDS = [
  'plannedSalePrice',
  'minCompetitorPrice',
  'costPrice',
  'packagingCost',
  'commissionPct',
  'logisticsRate',
  'drrPct',
  'sellerBonusPct',
  'reviewBonus',
  'taxPct',
] as const
type InputId = (typeof INPUT_IDS)[number]

export class KaspiUnitCalcElement {
  readonly host: HTMLDivElement

  private shadow: ShadowRoot
  private root!: HTMLElement
  private inputs!: Record<InputId, HTMLInputElement>
  private logisticsSelect!: HTMLSelectElement
  private logisticsLabel!: HTMLElement
  private metricEls!: Record<
    'profit' | 'margin' | 'markup' | 'roi' | 'breakeven' | 'competitor-delta',
    HTMLElement
  >
  private chipProfit!: HTMLElement

  private defaults: UserDefaults = DEFAULT_USER_SETTINGS
  private logisticsRates = { ...DEFAULT_USER_SETTINGS.logistics }
  private minCompetitorPrice: number | null = null
  private recalcTimer: number | null = null
  private changeTimer: number | null = null

  constructor() {
    this.host = document.createElement('div')
    this.shadow = this.host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = calculatorCss
    this.shadow.appendChild(style)
    const container = document.createElement('div')
    container.innerHTML = TEMPLATE_HTML
    this.shadow.appendChild(container.firstElementChild!)
    this.cacheRefs()
    this.attachListeners()
    this.applyInputsToDom(this.buildInputsFromDefaults())
    this.recalcAndRender()
  }

  private cacheRefs(): void {
    const $ = (sel: string) => this.shadow.querySelector(sel) as HTMLElement
    this.root = $('.root')
    this.chipProfit = $('[data-role="chip-profit"]')
    this.logisticsSelect = $('#selectedLogisticsType') as unknown as HTMLSelectElement
    this.logisticsLabel = $('[data-role="logistics-label"]')
    this.inputs = Object.fromEntries(
      INPUT_IDS.map((id) => [id, $(`#${id}`) as unknown as HTMLInputElement]),
    ) as Record<InputId, HTMLInputElement>
    this.metricEls = {
      profit: $('[data-role="profit"]'),
      margin: $('[data-role="margin"]'),
      markup: $('[data-role="markup"]'),
      roi: $('[data-role="roi"]'),
      breakeven: $('[data-role="breakeven"]'),
      'competitor-delta': $('[data-role="competitor-delta"]'),
    }
  }

  private attachListeners(): void {
    const $ = (sel: string) => this.shadow.querySelector(sel) as HTMLElement

    $('[data-role="toggle-header"]').addEventListener('click', (e) => {
      // Клик по close-кнопке не должен переключать секцию.
      if ((e.target as HTMLElement).closest('[data-role="close"]')) return
      this.root.classList.toggle('is-expanded')
    })

    $('[data-role="close"]').addEventListener('click', (e) => {
      e.stopPropagation()
      this.host.dispatchEvent(new CustomEvent('calc-close', { bubbles: true, composed: true }))
    })

    for (const id of INPUT_IDS) {
      if (id === 'plannedSalePrice') {
        // При изменении цены пересчитываем логистику по тарифной сетке.
        this.inputs[id].addEventListener('input', () => {
          this.applyAutoLogistics(this.parseNumber(this.inputs.plannedSalePrice.value))
          this.scheduleRecalc()
        })
      } else {
        this.inputs[id].addEventListener('input', () => this.scheduleRecalc())
      }
    }

    this.logisticsSelect.addEventListener('change', () => {
      const t = this.logisticsSelect.value as LogisticsType
      const price = this.parseNumber(this.inputs.plannedSalePrice.value)
      // Fallback берём из popup-дефолтов, НЕ из текущих ставок — иначе при переключении
      // типа после авто-подстановки 55₸ сетка вернёт 55₸ и для заказа ≥10 000 ₸.
      const rate = kaspiLogisticsRate(price, t, this.defaults.logistics)
      this.inputs.logisticsRate.value = String(rate)
      this.logisticsRates[t] = rate
      this.logisticsLabel.textContent = LOGISTICS_LABELS[t]
      this.scheduleRecalc()
    })

    this.inputs.logisticsRate.addEventListener('input', () => {
      const t = this.logisticsSelect.value as LogisticsType
      const v = this.parseNumber(this.inputs.logisticsRate.value)
      this.logisticsRates[t] = v
    })
  }

  /**
   * Применяет авто-тариф логистики на основе суммы заказа.
   * Источник fallback'а для ≥10 000 ₸ — popup-дефолты (this.defaults.logistics),
   * а не текущие logisticsRates (иначе при последовательных пересчётах
   * 1 903 → 55 → 55 popup-дефолт «загрязнится» тиром).
   * Обязательно синхронизируем this.logisticsRates[t] с DOM-инпутом —
   * calculate() читает именно logisticsRates, а не значение из DOM.
   */
  private applyAutoLogistics(price: number): void {
    const t = this.logisticsSelect.value as LogisticsType
    const rate = kaspiLogisticsRate(price, t, this.defaults.logistics)
    this.inputs.logisticsRate.value = String(rate)
    this.logisticsRates[t] = rate
  }

  // ─── Внешний API ────────────────────────────────────────────────

  setDefaults(defaults: UserDefaults): void {
    this.defaults = defaults
    this.logisticsRates = { ...defaults.logistics }
    this.applyInputsToDom(this.buildInputsFromDefaults())
    this.recalcAndRender()
  }

  setSnapshot(snapshot: ProductSnapshot): void {
    if (typeof snapshot.salePrice === 'number') {
      this.inputs.plannedSalePrice.value = String(snapshot.salePrice)
      // Цена изменилась — пересчитаем тариф логистики по сетке Kaspi.
      this.applyAutoLogistics(snapshot.salePrice)
    }
    // Только перезаписываем мин. конкурента, если пришло число.
    // null/undefined НЕ чистит поле — оставляем то, что было (история/предыдущий snapshot).
    if (typeof snapshot.minCompetitorPrice === 'number') {
      this.minCompetitorPrice = snapshot.minCompetitorPrice
      this.inputs.minCompetitorPrice.value = String(snapshot.minCompetitorPrice)
    }
    this.recalcAndRender()
  }

  /** Восстанавливает сохранённый расчёт; имеет приоритет над дефолтами. */
  setHistory(entry: HistoryEntry): void {
    this.logisticsRates = { ...entry.inputs.logistics }
    this.minCompetitorPrice = entry.inputs.minCompetitorPrice
    this.applyInputsToDom(entry.inputs)
    this.recalcAndRender()
  }

  /** Текущее состояние формы как CalculatorInputs. */
  readInputs(): CalculatorInputs {
    const sel = this.logisticsSelect.value as LogisticsType
    return {
      plannedSalePrice: this.parseNumber(this.inputs.plannedSalePrice.value),
      minCompetitorPrice: this.minCompetitorPrice,
      costPrice: this.parseNumber(this.inputs.costPrice.value),
      packagingCost: this.parseNumber(this.inputs.packagingCost.value),
      commissionPct: this.parseNumber(this.inputs.commissionPct.value),
      selectedLogisticsType: sel,
      logistics: { ...this.logisticsRates },
      drrPct: this.parseNumber(this.inputs.drrPct.value),
      sellerBonusPct: this.parseNumber(this.inputs.sellerBonusPct.value),
      reviewBonus: this.parseNumber(this.inputs.reviewBonus.value),
      taxPct: this.parseNumber(this.inputs.taxPct.value),
    }
  }

  // ─── Внутреннее ─────────────────────────────────────────────────

  private parseNumber(v: string): number {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }

  private buildInputsFromDefaults(): CalculatorInputs {
    return {
      costPrice: this.defaults.costPrice,
      commissionPct: this.defaults.commissionPct,
      selectedLogisticsType: this.defaults.selectedLogisticsType,
      logistics: { ...this.defaults.logistics },
      drrPct: this.defaults.drrPct,
      sellerBonusPct: this.defaults.sellerBonusPct,
      reviewBonus: this.defaults.reviewBonus,
      taxPct: this.defaults.taxPct,
      packagingCost: this.defaults.packagingCost,
      plannedSalePrice: 0,
      minCompetitorPrice: null,
    }
  }

  private applyInputsToDom(i: CalculatorInputs): void {
    this.inputs.plannedSalePrice.value = String(i.plannedSalePrice)
    this.inputs.minCompetitorPrice.value =
      i.minCompetitorPrice == null ? '' : String(i.minCompetitorPrice)
    this.minCompetitorPrice = i.minCompetitorPrice
    this.inputs.costPrice.value = String(i.costPrice)
    this.inputs.packagingCost.value = String(i.packagingCost)
    this.inputs.commissionPct.value = String(i.commissionPct)
    this.inputs.drrPct.value = String(i.drrPct)
    this.inputs.sellerBonusPct.value = String(i.sellerBonusPct)
    this.inputs.reviewBonus.value = String(i.reviewBonus)
    this.inputs.taxPct.value = String(i.taxPct)
    this.logisticsSelect.value = i.selectedLogisticsType
    this.logisticsLabel.textContent = LOGISTICS_LABELS[i.selectedLogisticsType]
    this.inputs.logisticsRate.value = String(i.logistics[i.selectedLogisticsType])
  }

  private scheduleRecalc(): void {
    if (this.recalcTimer != null) clearTimeout(this.recalcTimer)
    this.recalcTimer = window.setTimeout(() => {
      this.recalcAndRender()
      this.scheduleChangeEvent()
    }, 150)
  }

  private scheduleChangeEvent(): void {
    if (this.changeTimer != null) clearTimeout(this.changeTimer)
    this.changeTimer = window.setTimeout(() => {
      this.host.dispatchEvent(
        new CustomEvent('calc-change', {
          detail: { inputs: this.readInputs() },
          bubbles: true,
          composed: true,
        }),
      )
    }, 850) // 150ms recalc + 850ms ⇒ ~1s после остановки печати
  }

  private recalcAndRender(): void {
    const inputs = this.readInputs()
    const result = calculate(inputs)
    this.renderResult(result)
  }

  private renderResult(r: CalculatorResult): void {
    const profitStr = formatMoney(r.profit)
    const profitClass =
      r.profit > 0 ? '_positive' : r.profit < 0 ? '_negative' : ''
    this.metricEls.profit.textContent = profitStr
    this.metricEls.profit.className = `result__profit-value ${profitClass}`

    this.chipProfit.textContent = profitStr
    this.chipProfit.className =
      'header__chip ' +
      (r.profit > 0
        ? '_profit-positive'
        : r.profit < 0
          ? '_profit-negative'
          : '')

    this.metricEls.margin.textContent = formatPercent(r.marginPct)
    this.metricEls.markup.textContent = formatPercent(r.markupPct)
    this.metricEls.roi.textContent = formatPercent(r.roiPct)
    this.metricEls.breakeven.textContent = Number.isFinite(r.breakevenPrice)
      ? formatMoney(r.breakevenPrice)
      : '—'

    if (r.competitorDelta == null) {
      this.metricEls['competitor-delta'].textContent = '—'
      this.metricEls['competitor-delta'].className = 'metric__value'
    } else {
      const sign = r.competitorDelta > 0 ? '+' : ''
      this.metricEls['competitor-delta'].textContent = `${sign}${formatMoney(r.competitorDelta)}`
      this.metricEls['competitor-delta'].className =
        'metric__value ' +
        (r.competitorDelta > 0
          ? '_negative'
          : r.competitorDelta < 0
            ? '_positive'
            : '')
    }
  }
}

