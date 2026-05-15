"""
Сборщик скриншотов для CWS-листинга.

1. Берёт _styles.css и _widget.html.
2. Генерирует 3 сцены (HTML) с виджетом, встроенным inline.
3. Рендерит каждую через headless Chrome в PNG 1280x800.
4. Конвертирует в 24-bit PNG без альфа-канала (CWS-требование).
5. Кладёт результат в docs/screenshots/.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent
PROJ = ROOT.parent
OUT = PROJ / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
WIDTH, HEIGHT = 1280, 800

CSS = (ROOT / "_styles.css").read_text(encoding="utf-8")
WIDGET = (ROOT / "_widget.html").read_text(encoding="utf-8")


SCENES: list[tuple[str, str]] = [
    (
        "01-hero",
        f"""
<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>{CSS}</style></head>
<body><div class="scene">

  <div class="caption">
    <div class="caption__title">Считай <em>unit-экономику</em> прямо на странице товара Kaspi</div>
    <div class="caption__sub">Прибыль, маржа, ROI, точка безубыточности и Δ к конкуренту — мгновенно, без переключения в Excel.</div>
  </div>

  <div class="kaspi-frame">
    <div class="kaspi-frame__gallery">Фото товара</div>
    <div class="kaspi-frame__info">
      <div class="kaspi-frame__crumbs">Главная / Электроника / Аксессуары</div>
      <div class="kaspi-frame__title">Беспроводная гарнитура Soundcore Q35 — чёрный</div>
      <div class="kaspi-frame__rating">★ 4,8 · <b>1 240</b> отзывов</div>
      <div class="kaspi-frame__price">6 590 ₸</div>
      <div class="kaspi-frame__btn">В корзину</div>
      <div class="kaspi-frame__meta">
        Доставка <b>сегодня</b> · Алматы<br>
        Продавец: <b>Keep Looking Distribution</b><br>
        Рассрочка 0-0-12 от <b>549 ₸/мес.</b>
      </div>
    </div>
  </div>

  <div class="arrow">
    <svg viewBox="0 0 70 30"><path d="M0 15 L60 15" stroke="#f14635" stroke-width="2" fill="none"/>
      <path d="M50 6 L62 15 L50 24" stroke="#f14635" stroke-width="2" fill="none"/></svg>
  </div>

  <div class="widget-host">{WIDGET}</div>

</div></body></html>
""",
    ),
    (
        "02-widget-focus",
        f"""
<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>{CSS}
  body {{ background: linear-gradient(135deg, #fdf2f0 0%, #f6f7f8 60%); }}
  .focus-widget {{ position: absolute; top: 65px; left: 50%; transform: translateX(-50%) scale(0.92); transform-origin: top center; width: 360px; }}
  .focus-widget .widget {{ width: 360px; box-shadow: 0 12px 40px rgba(0,0,0,0.10); }}
  .focus-caption {{ position: absolute; top: 24px; left: 0; right: 0; text-align: center; }}
  .focus-caption__title {{ font-size: 24px; font-weight: 700; color: #1a1a1a; }}
  .focus-caption__title em {{ font-style: normal; color: #f14635; }}
  .bullets {{ position: absolute; top: 130px; left: 70px; width: 360px; display: flex; flex-direction: column; gap: 18px; }}
  .bullets__item {{ display: flex; gap: 14px; align-items: flex-start; }}
  .bullets__num {{ width: 32px; height: 32px; flex-shrink: 0; background: #f14635; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }}
  .bullets__txt {{ font-size: 15px; line-height: 1.45; color: #1a1a1a; }}
  .bullets__txt b {{ color: #1a1a1a; font-weight: 700; }}
  .bullets__txt span {{ color: #5b5b5b; display: block; font-size: 13px; margin-top: 2px; }}
  .side-caption {{ position: absolute; top: 130px; right: 60px; width: 320px; display: flex; flex-direction: column; gap: 18px; }}
</style></head>
<body><div class="scene">

  <div class="focus-caption">
    <div class="focus-caption__title">Все метрики на <em>одном экране</em></div>
  </div>

  <div class="bullets">
    <div class="bullets__item">
      <div class="bullets__num">1</div>
      <div class="bullets__txt"><b>Цена и конкурент</b><span>Подставляются из карточки Kaspi автоматически.</span></div>
    </div>
    <div class="bullets__item">
      <div class="bullets__num">2</div>
      <div class="bullets__txt"><b>Себестоимость и упаковка</b><span>Запоминаются в дефолтах, не вводите заново.</span></div>
    </div>
    <div class="bullets__item">
      <div class="bullets__num">3</div>
      <div class="bullets__txt"><b>Комиссия и логистика</b><span>Тарифы Kaspi 2026 с НДС — авто по сумме заказа.</span></div>
    </div>
    <div class="bullets__item">
      <div class="bullets__num">4</div>
      <div class="bullets__txt"><b>ДРР, бонусы, налог</b><span>Полный набор статей расходов селлера.</span></div>
    </div>
  </div>

  <div class="focus-widget">{WIDGET}</div>

  <div class="side-caption">
    <div class="bullets__item">
      <div class="bullets__num" style="background:#0a7d3e;">✓</div>
      <div class="bullets__txt"><b>Прибыль · Маржа · ROI</b><span>Считаются в реальном времени по мере ввода.</span></div>
    </div>
    <div class="bullets__item">
      <div class="bullets__num" style="background:#0a7d3e;">✓</div>
      <div class="bullets__txt"><b>Точка безубыточности</b><span>Минимальная цена, при которой прибыль = 0.</span></div>
    </div>
    <div class="bullets__item">
      <div class="bullets__num" style="background:#0a7d3e;">✓</div>
      <div class="bullets__txt"><b>Δ к минимальному конкуренту</b><span>На сколько ваша цена выше или ниже рынка.</span></div>
    </div>
  </div>

</div></body></html>
""",
    ),
    (
        "03-popup-settings",
        f"""
<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>{CSS}
  body {{ background: #f6f7f8; }}
  .popup {{ position: absolute; top: 80px; left: 80px; width: 440px; background: #fff; border-radius: 10px; border: 1px solid #e3e3e3; box-shadow: 0 8px 28px rgba(0,0,0,0.08); padding: 24px 24px 20px; }}
  .popup__title {{ font-size: 18px; font-weight: 700; }}
  .popup__sub {{ font-size: 13px; color: #6b6b6b; margin-bottom: 18px; }}
  .popup__section {{ margin-top: 18px; }}
  .popup__legend {{ font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #6b6b6b; padding-bottom: 6px; border-bottom: 1px solid #e3e3e3; margin-bottom: 8px; }}
  .popup__row {{ display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }}
  .popup__row span {{ font-size: 13px; color: #1a1a1a; }}
  .popup__row input, .popup__row select {{ width: 120px; padding: 5px 8px; border: 1px solid #c4c4c4; border-radius: 4px; font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }}
  .popup__row select {{ text-align: left; padding-right: 22px; }}
  .popup__actions {{ display: flex; gap: 8px; margin-top: 18px; }}
  .popup__btn {{ flex: 1; padding: 9px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer; }}
  .popup__btn--ghost {{ background: #fff; border: 1px solid #c4c4c4; color: #1a1a1a; }}
  .popup__btn--primary {{ background: #f14635; color: #fff; border: 1px solid #f14635; }}

  .right-caption {{ position: absolute; top: 90px; right: 60px; width: 540px; }}
  .right-caption h2 {{ font-size: 30px; font-weight: 700; color: #1a1a1a; line-height: 1.15; }}
  .right-caption h2 em {{ font-style: normal; color: #f14635; }}
  .right-caption p {{ font-size: 16px; color: #5b5b5b; margin-top: 14px; line-height: 1.5; }}
  .right-caption ul {{ list-style: none; margin-top: 22px; display: flex; flex-direction: column; gap: 14px; }}
  .right-caption li {{ font-size: 15px; color: #1a1a1a; padding-left: 28px; position: relative; line-height: 1.4; }}
  .right-caption li:before {{ content: '✓'; position: absolute; left: 0; top: 0; color: #0a7d3e; font-weight: 700; font-size: 18px; }}

  .badge {{ position: absolute; bottom: 32px; left: 80px; display: inline-flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e3e3e3; border-radius: 999px; padding: 8px 14px; font-size: 13px; color: #1a1a1a; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }}
  .badge svg {{ width: 16px; height: 16px; color: #0a7d3e; }}
</style></head>
<body><div class="scene">

  <div class="popup">
    <div class="popup__title">Kaspi Unit Calculator</div>
    <div class="popup__sub">Дефолтные значения для расчёта</div>

    <div class="popup__section">
      <div class="popup__legend">Себестоимость и упаковка</div>
      <div class="popup__row"><span>Себестоимость, ₸</span><input value="0" /></div>
      <div class="popup__row"><span>Упаковка, ₸</span><input value="80" /></div>
    </div>

    <div class="popup__section">
      <div class="popup__legend">Комиссии Kaspi</div>
      <div class="popup__row"><span>Комиссия с НДС, %</span><input value="12" /></div>
      <div class="popup__row"><span>Тип логистики по умолчанию</span><select><option>По городу</option></select></div>
      <div class="popup__row"><span>Логистика «По городу», ₸</span><input value="1 231" /></div>
      <div class="popup__row"><span>Логистика «Межгород», ₸</span><input value="1 455" /></div>
    </div>

    <div class="popup__section">
      <div class="popup__legend">Налог</div>
      <div class="popup__row"><span>Налог, %</span><input value="4" /></div>
    </div>

    <div class="popup__actions">
      <div class="popup__btn popup__btn--ghost">Сбросить</div>
      <div class="popup__btn popup__btn--primary">Сохранить</div>
    </div>
  </div>

  <div class="right-caption">
    <h2>Один раз задал дефолты — <em>работает дальше</em></h2>
    <p>Себестоимость, комиссия, тарифы логистики Kaspi 2026, ДРР и налог — всё в popup настроек расширения.</p>
    <ul>
      <li>Дефолты подставляются автоматически в каждую карточку</li>
      <li>Тарифы логистики Kaspi на 01.01.2026 с НДС 12%</li>
      <li>История расчётов сохраняется по каждому товару</li>
      <li>Всё хранится локально — никакой телеметрии</li>
    </ul>
  </div>

  <div class="badge">
    <svg viewBox="0 0 16 16"><path fill="currentColor" d="M6.5 11.5L3 8l1.1-1.1L6.5 9.3l5.4-5.4L13 5z"/></svg>
    Данные хранятся локально в браузере
  </div>

</div></body></html>
""",
    ),
]


def render(name: str, html: str) -> Path:
    src = ROOT / f"{name}.html"
    src.write_text(html, encoding="utf-8")
    raw = ROOT / f"{name}.raw.png"
    cmd = [
        CHROME,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
        f"--window-size={WIDTH},{HEIGHT}",
        f"--screenshot={raw}",
        "--virtual-time-budget=2000",
        f"file:///{src.as_posix()}",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        print("Chrome stderr:", r.stderr, file=sys.stderr)
        raise RuntimeError(f"chrome failed for {name}")
    if not raw.exists():
        raise RuntimeError(f"no PNG for {name}")

    # Strip alpha, enforce 1280x800, save as 24-bit PNG
    img = Image.open(raw).convert("RGB")
    if img.size != (WIDTH, HEIGHT):
        img = img.resize((WIDTH, HEIGHT), Image.LANCZOS)
    final = OUT / f"{name}.png"
    img.save(final, "PNG", optimize=True)
    raw.unlink(missing_ok=True)
    sz = final.stat().st_size
    print(f"OK {final.name}  {img.size[0]}x{img.size[1]}  {sz//1024} KB  mode={img.mode}")
    return final


def main() -> None:
    if not Path(CHROME).exists():
        sys.exit("Chrome not found at " + CHROME)
    for name, html in SCENES:
        render(name, html)
    print("\nDone. Output:", OUT)


if __name__ == "__main__":
    main()
