/**
 * Инжект калькулятора в карточку Kaspi.
 *
 *  - Находит точку инжекта в правой колонке (см. kaspi-parser.findInsertionPoint).
 *  - Создаёт KaspiUnitCalcElement (plain div + Shadow DOM), подсовывает дефолты/историю/snapshot.
 *  - Сохраняет историю по product_id (debounced).
 *  - На X закрывает и помечает product_id как hidden.
 *  - MutationObserver-страховка: если Kaspi затрёт наш узел при ре-рендере
 *    своей правой колонки, переинжектим.
 */

import { calculate } from '../shared/calculator'
import { OUR_SELLER_NAME } from '../shared/constants'
import {
  getHistoryEntry,
  getUserDefaults,
  isHidden,
  markHidden,
  saveHistoryEntry,
} from '../shared/storage'
import type { CalculatorInputs, ProductSnapshot } from '../shared/types'
import { KaspiUnitCalcElement } from './calculator-ui'
import {
  extractProductId,
  fetchCompetitorInfo,
  findInsertionPoint,
  parseCard,
  waitFor,
} from './kaspi-parser'

const HOST_ATTR = 'data-kaspi-unit-calc-host'

let currentEl: KaspiUnitCalcElement | null = null
let reinjectObserver: MutationObserver | null = null
let lastSnapshot: ProductSnapshot | null = null
let calculatorTitle = ''

export async function injectCalculator(): Promise<void> {
  const productId = extractProductId()
  if (!productId) return

  if (await isHidden(productId)) return

  const defaultsEarly = await getUserDefaults()
  if (!defaultsEarly.autoShow) return

  const insertionPoint = await waitFor(() => findInsertionPoint(), 8_000)
  if (!insertionPoint) {
    // eslint-disable-next-line no-console
    console.debug('[kaspi-unit-calc] insertion point not found, skipping')
    return
  }

  const [defaults, historyEntry] = [
    defaultsEarly,
    await getHistoryEntry(productId),
  ]

  // Контент-скрипты Chrome MV3 работают в isolated world и не видят page-world
  // `window.BACKEND`. Поэтому используем DOM-парсинг <script>-тэгов как основной путь
  // (page-world пробуем тоже — на случай, если кто-то решит крутить world: 'MAIN').
  // BACKEND-скрипт инлайнится сервером в SSR-HTML, доступен сразу при document_idle.
  const card = await waitFor(() => parseCard(), 5_000)
  calculatorTitle = card?.title ?? ''
  // eslint-disable-next-line no-console
  if (!card) console.debug('[kaspi-unit-calc] card not found after waitFor')
  else console.debug('[kaspi-unit-calc] card parsed:', { id: card.id, price: card.price })

  const el = mount(insertionPoint)
  currentEl = el
  el.setDefaults(defaults)
  if (historyEntry) el.setHistory(historyEntry)

  // card.price = минимальная цена в Kaspi (то что отображается на странице).
  // Подставляем сразу для ВСЕХ случаев: конкурент всегда актуальный.
  // salePrice: null в случае истории — не затираем ранее введённую цену.
  const cardPrice = card?.price ?? null
  el.setSnapshot({
    productId,
    productName: card?.title ?? '',
    brand: card?.promoConditions?.brand ?? null,
    sellerName: null,
    salePrice: historyEntry ? null : cardPrice,
    minCompetitorPrice: cardPrice,
  })

  // API уточняет имя продавца и зональную цену; обновляем если пришло.
  fetchCompetitorInfo(productId, OUR_SELLER_NAME).then((info) => {
    const snapshot: ProductSnapshot = {
      productId,
      productName: card?.title ?? '',
      brand: card?.promoConditions?.brand ?? null,
      sellerName: info.cheapestSeller,
      salePrice: historyEntry ? null : cardPrice,
      minCompetitorPrice: info.minPrice ?? cardPrice,
    }
    lastSnapshot = snapshot
    el.setSnapshot(snapshot)
  })

  el.host.addEventListener('calc-close', () => {
    void markHidden(productId).finally(() => {
      el.host.remove()
      currentEl = null
      reinjectObserver?.disconnect()
      reinjectObserver = null
    })
  })

  el.host.addEventListener('calc-change', (e: Event) => {
    const inputs = (e as CustomEvent<{ inputs: CalculatorInputs }>).detail.inputs
    persistHistory(productId, inputs)
  })

  setupReinjectGuard(insertionPoint, productId)
}

function mount(parent: HTMLElement): KaspiUnitCalcElement {
  // Удалим предыдущий хост, если был.
  parent.querySelectorAll(`[${HOST_ATTR}]`).forEach((n) => n.remove())
  const el = new KaspiUnitCalcElement()
  el.host.setAttribute(HOST_ATTR, '1')
  parent.appendChild(el.host)
  return el
}

async function persistHistory(
  productId: string,
  inputs: CalculatorInputs,
): Promise<void> {
  if (!currentEl) return
  const result = calculate(inputs)
  await saveHistoryEntry(productId, calculatorTitle, inputs, result)
}

function setupReinjectGuard(originalInsertionPoint: HTMLElement, productId: string): void {
  reinjectObserver?.disconnect()
  reinjectObserver = new MutationObserver(() => {
    if (!document.body.contains(originalInsertionPoint)) {
      // Kaspi удалил всю правую колонку — найдём новую и переинжектнём.
      reinjectObserver?.disconnect()
      reinjectObserver = null
      void injectCalculator()
      return
    }
    if (!originalInsertionPoint.querySelector(`[${HOST_ATTR}]`)) {
      // Нашего хоста нет в insertion point — Kaspi переписал innerHTML.
      // Не перезапускаем полностью, просто примонтируем заново и применим состояние.
      const el = mount(originalInsertionPoint)
      currentEl = el
      void getUserDefaults().then((d) => el.setDefaults(d))
      void getHistoryEntry(productId).then((h) => {
        if (h) el.setHistory(h)
        else if (lastSnapshot) el.setSnapshot(lastSnapshot)
      })
      // Перевешиваем обработчики.
      el.host.addEventListener('calc-close', () => {
        void markHidden(productId).finally(() => {
          el.host.remove()
          currentEl = null
          reinjectObserver?.disconnect()
          reinjectObserver = null
        })
      })
      el.host.addEventListener('calc-change', (e: Event) => {
        const inputs = (e as CustomEvent<{ inputs: CalculatorInputs }>).detail.inputs
        persistHistory(productId, inputs)
      })
    }
  })
  reinjectObserver.observe(document.body, { childList: true, subtree: true })
}
