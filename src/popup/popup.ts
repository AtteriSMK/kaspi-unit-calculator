/**
 * Popup настроек. Читает дефолты из chrome.storage.sync, заполняет форму,
 * сохраняет обратно. Кнопка «Сбросить» возвращает заводские значения.
 */

import { DEFAULT_USER_SETTINGS } from '../shared/constants'
import {
  getUserDefaults,
  resetUserDefaults,
  setUserDefaults,
} from '../shared/storage'
import type { LogisticsType, UserDefaults } from '../shared/types'

type FlatKey =
  | 'costPrice'
  | 'packagingCost'
  | 'commissionPct'
  | 'selectedLogisticsType'
  | 'logistics.city'
  | 'logistics.intercity'
  | 'logistics.express'
  | 'logistics.own'
  | 'drrPct'
  | 'sellerBonusPct'
  | 'reviewBonus'
  | 'taxPct'
  | 'autoShow'

const form = document.getElementById('settings-form') as HTMLFormElement
const statusEl = document.getElementById('status') as HTMLElement
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement

function field<T extends HTMLElement = HTMLInputElement>(name: FlatKey): T {
  return form.elements.namedItem(name) as T
}

function applyToForm(d: UserDefaults): void {
  ;(field('costPrice') as HTMLInputElement).value = String(d.costPrice)
  ;(field('packagingCost') as HTMLInputElement).value = String(d.packagingCost)
  ;(field('commissionPct') as HTMLInputElement).value = String(d.commissionPct)
  ;(field<HTMLSelectElement>('selectedLogisticsType')).value = d.selectedLogisticsType
  ;(field('logistics.city') as HTMLInputElement).value = String(d.logistics.city)
  ;(field('logistics.intercity') as HTMLInputElement).value = String(d.logistics.intercity)
  ;(field('logistics.express') as HTMLInputElement).value = String(d.logistics.express)
  ;(field('logistics.own') as HTMLInputElement).value = String(d.logistics.own)
  ;(field('drrPct') as HTMLInputElement).value = String(d.drrPct)
  ;(field('sellerBonusPct') as HTMLInputElement).value = String(d.sellerBonusPct)
  ;(field('reviewBonus') as HTMLInputElement).value = String(d.reviewBonus)
  ;(field('taxPct') as HTMLInputElement).value = String(d.taxPct)
  ;(field('autoShow') as HTMLInputElement).checked = d.autoShow
}

function readForm(): UserDefaults {
  const num = (n: FlatKey): number => {
    const v = parseFloat((field(n) as HTMLInputElement).value.replace(',', '.'))
    return Number.isFinite(v) ? v : 0
  }
  return {
    costPrice: num('costPrice'),
    packagingCost: num('packagingCost'),
    commissionPct: num('commissionPct'),
    selectedLogisticsType: (field<HTMLSelectElement>('selectedLogisticsType')
      .value as LogisticsType),
    logistics: {
      city: num('logistics.city'),
      intercity: num('logistics.intercity'),
      express: num('logistics.express'),
      own: num('logistics.own'),
    },
    drrPct: num('drrPct'),
    sellerBonusPct: num('sellerBonusPct'),
    reviewBonus: num('reviewBonus'),
    taxPct: num('taxPct'),
    autoShow: (field('autoShow') as HTMLInputElement).checked,
  }
}

function showStatus(text: string, isError = false): void {
  statusEl.textContent = text
  statusEl.classList.toggle('_error', isError)
  window.setTimeout(() => {
    if (statusEl.textContent === text) statusEl.textContent = ''
  }, 2_000)
}

async function init(): Promise<void> {
  const current = await getUserDefaults()
  applyToForm(current)

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    void (async () => {
      try {
        const next = readForm()
        await setUserDefaults(next)
        showStatus('Сохранено')
      } catch (err) {
        showStatus('Не удалось сохранить', true)
        // eslint-disable-next-line no-console
        console.error('[popup] save failed', err)
      }
    })()
  })

  resetBtn.addEventListener('click', () => {
    void (async () => {
      const restored = await resetUserDefaults()
      applyToForm(restored)
      showStatus('Сброшено к заводским')
    })()
  })
}

// Если chrome.storage недоступен (например, превью popup.html в браузере без расширения)
// — покажем дефолты, чтобы UI не оставался пустым.
if (typeof chrome === 'undefined' || !chrome.storage) {
  applyToForm(DEFAULT_USER_SETTINGS)
} else {
  void init()
}
