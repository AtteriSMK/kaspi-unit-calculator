import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  extractJsonAssignment,
  extractProductId,
  fetchCompetitorInfo,
  parseCardFromGlobal,
  parseCardFromHtml,
} from './kaspi-parser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const realFixture = readFileSync(
  join(__dirname, '__fixtures__/kaspi-product-117120120.html'),
  'utf8',
)

// ─── extractProductId ────────────────────────────────────────────────

describe('extractProductId', () => {
  it.each([
    [
      'https://kaspi.kz/shop/p/accoje-syvorotka-vital-in-jeju-time-repair-serum-dlja-litsa-50-ml-117120120/',
      '117120120',
    ],
    [
      'https://kaspi.kz/shop/p/empire-australia-lotus-flower-sweet-orange-bal-zam-dlja-ruk-125-ml-119402348/',
      '119402348',
    ],
    [
      'https://kaspi.kz/shop/p/la-sultane-de-saba-bois-de-oud-100-ml-uniseks-116751927/?c=750000000&v=reviews',
      '116751927',
    ],
    [
      'https://kaspi.kz/shop/p/some-product-name-1234567/#tab-sellers',
      '1234567',
    ],
  ])('извлекает product_id из %s → %s', (url, expected) => {
    expect(extractProductId(url)).toBe(expected)
  })

  it('возвращает null, если URL — не карточка товара', () => {
    expect(extractProductId('https://kaspi.kz/shop/c/beauty%20care/')).toBeNull()
    expect(extractProductId('https://kaspi.kz/')).toBeNull()
  })

  it('не путает короткие числа в URL с product_id', () => {
    // 5 цифр — слишком мало под product_id Kaspi.
    expect(extractProductId('https://kaspi.kz/shop/p/foo-12345/')).toBeNull()
  })
})

// ─── extractJsonAssignment ───────────────────────────────────────────

describe('extractJsonAssignment', () => {
  it('извлекает плоский объект', () => {
    const text = 'noise; BACKEND.x = {"a": 1, "b": "two"}; more noise'
    expect(extractJsonAssignment(text, 'BACKEND.x')).toEqual({ a: 1, b: 'two' })
  })

  it('корректно матчит вложенные фигурные скобки', () => {
    const text = 'BACKEND.foo = {"a": {"b": {"c": 3}}, "d": [1, 2, {"e": 4}]};'
    expect(extractJsonAssignment(text, 'BACKEND.foo')).toEqual({
      a: { b: { c: 3 } },
      d: [1, 2, { e: 4 }],
    })
  })

  it('игнорирует фигурные скобки внутри строк', () => {
    const text = 'X = {"title": "контракт { юр-лица }", "n": 5};'
    expect(extractJsonAssignment(text, 'X')).toEqual({
      title: 'контракт { юр-лица }',
      n: 5,
    })
  })

  it('корректно обрабатывает экранированные кавычки', () => {
    const text = 'X = {"a": "say \\"hi\\""};'
    expect(extractJsonAssignment(text, 'X')).toEqual({ a: 'say "hi"' })
  })

  it('возвращает null, если переменная не найдена', () => {
    expect(extractJsonAssignment('noise', 'BACKEND.x')).toBeNull()
  })
})

// ─── parseCardFromHtml (синтетический фрагмент Kaspi-страницы) ───────

const REAL_BACKEND_FRAGMENT = `
  <h1 class="item__heading">Accoje сыворотка Vital in Jeju Time Repair Serum для лица 50 мл</h1>
  <div class="item__price"></div>
  </div></div></div></div></div></div><div class="item-content">...
  <script>
    BACKEND.state.productId = "117120120";
    BACKEND.components.item = {"card":{"id":"117120120","title":"Accoje сыворотка Vital in Jeju Time Repair Serum для лица 50 мл","categoryId":"03261","promoConditions":{"brand":"Accoje","categoryCodes":["Creams","Skin care","Beauty care","Categories"],"baseProductCodes":[],"groups":null,"productSeries":[]},"stickers":null,"price":18600,"discount":0,"unitPriceBeforeDiscount":0}};
  </script>
`

describe('parseCardFromHtml — против реалистичного фрагмента Kaspi', () => {
  it('вытаскивает все ключевые поля карточки', () => {
    const card = parseCardFromHtml(REAL_BACKEND_FRAGMENT)
    expect(card).not.toBeNull()
    expect(card!.id).toBe('117120120')
    expect(card!.title).toContain('Accoje')
    expect(card!.price).toBe(18_600)
    expect(card!.promoConditions?.brand).toBe('Accoje')
  })

  it('возвращает null, если BACKEND не присвоен', () => {
    expect(parseCardFromHtml('<html><body>no script here</body></html>')).toBeNull()
  })

  it('возвращает null, если структура card неполная (нет price)', () => {
    const html = 'BACKEND.components.item = {"card":{"id":"123","title":"x"}};'
    expect(parseCardFromHtml(html)).toBeNull()
  })
})

// ─── Smoke-тест на реальной HTML-фикстуре Kaspi ───────────────────────

describe('parseCardFromHtml — smoke против реального снимка kaspi.kz', () => {
  it('извлекает card из снимка product_id=117120120', () => {
    const card = parseCardFromHtml(realFixture)
    expect(card).not.toBeNull()
    expect(card!.id).toBe('117120120')
    expect(card!.price).toBe(18_600)
    expect(card!.title).toBe(
      'Accoje сыворотка Vital in Jeju Time Repair Serum для лица 50 мл',
    )
    expect(card!.promoConditions?.brand).toBe('Accoje')
  })
})

// ─── parseCardFromGlobal ─────────────────────────────────────────────

describe('parseCardFromGlobal', () => {
  it('читает window.BACKEND.components.item.card', () => {
    const g = {
      BACKEND: {
        components: {
          item: {
            card: {
              id: '117120120',
              title: 'Test product',
              price: 18_600,
              promoConditions: { brand: 'Accoje' },
            },
          },
        },
      },
    }
    const card = parseCardFromGlobal(g)
    expect(card?.id).toBe('117120120')
    expect(card?.price).toBe(18_600)
  })

  it('возвращает null, если BACKEND отсутствует', () => {
    expect(parseCardFromGlobal({})).toBeNull()
  })

  it('возвращает null, если price не number', () => {
    const g = {
      BACKEND: {
        components: {
          item: { card: { id: '1', title: 't', price: '18600' } },
        },
      },
    }
    expect(parseCardFromGlobal(g)).toBeNull()
  })
})

// ─── fetchCompetitorInfo ─────────────────────────────────────────────

function makeFetcher(payload: unknown, ok = true): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 500,
    }),
  ) as unknown as typeof fetch
}

describe('fetchCompetitorInfo', () => {
  it('возвращает минимальную цену и продавца из offers', async () => {
    const payload = {
      total: 3,
      offers: [
        { merchantName: 'AAA', price: 6_200 },
        { merchantName: 'BBB', price: 6_500 },
        { merchantName: 'CCC', price: 7_000 },
      ],
    }
    const info = await fetchCompetitorInfo('117120120', undefined, makeFetcher(payload))
    expect(info.minPrice).toBe(6_200)
    expect(info.cheapestSeller).toBe('AAA')
    expect(info.totalOffers).toBe(3)
    expect(info.ourSellerListed).toBe(false)
  })

  it('защитно вычисляет минимум, даже если API вернул несортированный список', async () => {
    const payload = {
      offers: [
        { merchantName: 'X', price: 9_000 },
        { merchantName: 'Y', price: 6_100 }, // дешевле, но не первая
        { merchantName: 'Z', price: 7_500 },
      ],
    }
    const info = await fetchCompetitorInfo('1', undefined, makeFetcher(payload))
    expect(info.minPrice).toBe(6_100)
    expect(info.cheapestSeller).toBe('Y')
  })

  it('помечает ourSellerListed=true, если наш магазин найден среди offers', async () => {
    const payload = {
      offers: [
        { merchantName: 'AAA', price: 6_000 },
        { merchantName: 'Официальный дистрибьютор Keep Looking Distribution', price: 6_300 },
      ],
    }
    const info = await fetchCompetitorInfo(
      '1',
      'Официальный дистрибьютор Keep Looking Distribution',
      makeFetcher(payload),
    )
    expect(info.ourSellerListed).toBe(true)
    expect(info.cheapestSeller).toBe('AAA') // мы не самые дешёвые в этом сценарии
  })

  it('возвращает пустой результат при HTTP-ошибке', async () => {
    const info = await fetchCompetitorInfo('1', undefined, makeFetcher({}, false))
    expect(info.minPrice).toBeNull()
    expect(info.cheapestSeller).toBeNull()
    expect(info.totalOffers).toBe(0)
  })

  it('возвращает пустой результат при отсутствии offers', async () => {
    const info = await fetchCompetitorInfo('1', undefined, makeFetcher({ offers: [] }))
    expect(info.minPrice).toBeNull()
    expect(info.totalOffers).toBe(0)
  })

  it('переживает выброс из fetch (сеть умерла)', async () => {
    const broken = vi.fn(async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    const info = await fetchCompetitorInfo('1', undefined, broken)
    expect(info.minPrice).toBeNull()
  })
})
