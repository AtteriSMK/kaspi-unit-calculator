/**
 * Парсер карточки товара Kaspi.kz.
 *
 * Источник данных:
 *  - `window.BACKEND.components.item.card` — гидрированный сервером JSON
 *    с id/title/price/brand. Инлайнится в <script> в SSR HTML, доступен сразу.
 *  - POST `https://kaspi.kz/yml/offer-view/offers/{pid}` — список продавцов,
 *    отсортированный по цене (offers[0] = минимум).
 *
 * `item__price` в DOM пустой до клиентской гидрации — намеренно не используем.
 */

import type { ProductSnapshot } from '../shared/types'

export interface KaspiCard {
  id: string
  title: string
  price: number
  discount?: number
  promoConditions?: {
    brand?: string
    categoryCodes?: string[]
  } | null
}

export interface KaspiOffer {
  merchantName: string
  price: number
  title?: string
}

export interface CompetitorInfo {
  minPrice: number | null
  cheapestSeller: string | null
  totalOffers: number
  ourSellerListed: boolean
}

const PRODUCT_URL_RE = /\/shop\/p\/[^/?#]*?-(\d{6,12})(?:\/|\?|$)/
const CITY_ID = '750000000' // Алматы — дефолт из Python-парсера
const ZONE_ID = ['Magnum_ZONE1']
const SELLERS_API = 'https://kaspi.kz/yml/offer-view/offers/'

// ─── Product ID ─────────────────────────────────────────────────────

export function extractProductId(url: string = location.href): string | null {
  const m = PRODUCT_URL_RE.exec(url)
  return m ? m[1]! : null
}

// ─── Card extraction ────────────────────────────────────────────────

interface GlobalWithBackend {
  BACKEND?: {
    components?: { item?: { card?: unknown } }
    state?: { productId?: string }
  }
}

function asCard(v: unknown): KaspiCard | null {
  if (!v || typeof v !== 'object') return null
  const obj = v as Record<string, unknown>
  if (typeof obj.id !== 'string') return null
  if (typeof obj.title !== 'string') return null
  // price может быть числом или строкой в зависимости от версии Kaspi BACKEND
  const rawPrice = obj.price
  const price =
    typeof rawPrice === 'number'
      ? rawPrice
      : typeof rawPrice === 'string'
        ? parseFloat(rawPrice)
        : NaN
  if (!Number.isFinite(price) || price <= 0) {
    // eslint-disable-next-line no-console
    console.debug('[kaspi-unit-calc] card found but price invalid:', rawPrice)
    return null
  }
  return { ...(obj as object), price } as unknown as KaspiCard
}

export function parseCardFromGlobal(
  g: GlobalWithBackend = window as unknown as GlobalWithBackend,
): KaspiCard | null {
  return asCard(g.BACKEND?.components?.item?.card)
}

/**
 * Парсит BACKEND.components.item из инлайн-<script> тэгов в DOM.
 * Это РАБОЧИЙ путь для контент-скриптов в isolated world: они не видят
 * page-world `window.BACKEND`, но видят DOM (включая textContent script-тэгов).
 *
 * SSR-Kaspi кладёт `BACKEND.components.item = {…};` прямо в HTML.
 */
export function parseCardFromScripts(
  doc: Document = document,
): KaspiCard | null {
  const scripts = doc.querySelectorAll<HTMLScriptElement>('script')
  for (const s of scripts) {
    const text = s.textContent
    if (!text || !text.includes('BACKEND.components.item')) continue
    const parsed = extractJsonAssignment(text, 'BACKEND.components.item')
    if (!parsed || typeof parsed !== 'object') continue
    const card = (parsed as Record<string, unknown>).card
    const result = asCard(card)
    if (result) return result
  }
  return null
}

/** Сначала пробуем page-world window.BACKEND, затем DOM scripts. */
export function parseCard(): KaspiCard | null {
  return parseCardFromGlobal() ?? parseCardFromScripts()
}

/**
 * Брейс-аккуратный экстрактор JSON-литерала, присвоенного переменной.
 * Например, для текста `BACKEND.components.item = {…};` вернёт распарсенный объект.
 */
export function extractJsonAssignment(text: string, lhs: string): unknown | null {
  const needle = `${lhs} = `
  const start = text.indexOf(needle)
  if (start === -1) return null
  let i = start + needle.length
  while (i < text.length && /\s/.test(text[i]!)) i++
  if (text[i] !== '{') return null
  let depth = 0
  let inString = false
  let escape = false
  for (let j = i; j < text.length; j++) {
    const c = text[j]!
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (c === '\\') escape = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.substring(i, j + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function parseCardFromHtml(html: string): KaspiCard | null {
  const parsed = extractJsonAssignment(html, 'BACKEND.components.item')
  if (!parsed || typeof parsed !== 'object') return null
  const card = (parsed as Record<string, unknown>).card
  return asCard(card)
}

// ─── Sellers API ────────────────────────────────────────────────────

export async function fetchCompetitorInfo(
  productId: string,
  ourSellerName?: string,
  fetcher: typeof fetch = fetch,
): Promise<CompetitorInfo> {
  const body = {
    cityId: CITY_ID,
    id: productId,
    merchantUID: [],
    limit: 100,
    page: 0,
    product: {
      brand: '',
      categoryCodes: [],
      baseProductCodes: [],
      groups: null,
      productSeries: [],
    },
    sortOption: 'PRICE',
    highRating: null,
    searchText: null,
    isExcellentMerchant: false,
    zoneId: ZONE_ID,
    installationId: '-1',
  }

  const fail: CompetitorInfo = {
    minPrice: null,
    cheapestSeller: null,
    totalOffers: 0,
    ourSellerListed: false,
  }

  try {
    const r = await fetcher(`${SELLERS_API}${productId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json, text/*',
        'x-ks-city': CITY_ID,
      },
      body: JSON.stringify(body),
    })
    if (!r.ok) return fail

    const data = (await r.json()) as { offers?: KaspiOffer[]; total?: number }
    const offers = Array.isArray(data.offers) ? data.offers : []
    if (offers.length === 0) return fail

    // На случай, если сортировка от API не пришла — считаем минимум сами.
    const cheapest = offers.reduce<KaspiOffer | null>(
      (acc, o) =>
        typeof o.price === 'number' && (!acc || o.price < acc.price) ? o : acc,
      null,
    )
    if (!cheapest) return fail

    const ourSellerListed = ourSellerName
      ? offers.some((o) => o.merchantName === ourSellerName)
      : false

    return {
      minPrice: cheapest.price,
      cheapestSeller: cheapest.merchantName ?? null,
      totalOffers: offers.length,
      ourSellerListed,
    }
  } catch {
    return fail
  }
}

// ─── Wait helpers (MutationObserver-driven, без setTimeout-полли́нга) ──

/**
 * Дожидается, пока `predicate()` вернёт не-null значение.
 * Триггерится через MutationObserver на любых изменениях DOM + одна проверка
 * синхронно сразу. Возвращает null по таймауту.
 */
export function waitFor<T>(
  predicate: () => T | null | undefined,
  timeoutMs = 5_000,
  root: Node = document.documentElement,
): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false
    const check = (): boolean => {
      const v = predicate()
      if (v == null || done) return false
      done = true
      observer.disconnect()
      clearTimeout(timer)
      resolve(v)
      return true
    }
    const observer = new MutationObserver(() => {
      check()
    })
    observer.observe(root, { childList: true, subtree: true })
    const timer = setTimeout(() => {
      if (done) return
      done = true
      observer.disconnect()
      resolve(null)
    }, timeoutMs)
    check()
  })
}

// ─── Insertion point in DOM ─────────────────────────────────────────

const INSERTION_SELECTORS = [
  '#ItemView .item__inner-right > div',
  '.item__inner-right',
  '#ItemView .item__description',
  '#mount-item-page',
] as const

export function findInsertionPoint(): HTMLElement | null {
  for (const sel of INSERTION_SELECTORS) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) return el
  }
  return null
}

// ─── Orchestrator ───────────────────────────────────────────────────

export async function parseProductSnapshot(
  ourSellerName?: string,
): Promise<ProductSnapshot | null> {
  const productId = extractProductId()
  if (!productId) return null

  const card = await waitFor(() => parseCardFromGlobal(), 5_000)

  // Параллельно тянем продавцов; если карточка не нашлась — всё равно вернём что есть.
  const competitor = await fetchCompetitorInfo(productId, ourSellerName)

  return {
    productId,
    productName: card?.title ?? '',
    brand: card?.promoConditions?.brand ?? null,
    sellerName: competitor.cheapestSeller,
    salePrice: card?.price ?? null,
    minCompetitorPrice: competitor.minPrice,
  }
}
