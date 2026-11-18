import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { GOKU_PATHS } from './goku-svg.js'
import { SHENRON_PATHS } from './shenron-svg.js'
import { TLO_PATHS } from './tlo-svg.js'
import { TLO_NOC_PATHS } from './tlo-noc-svg.js'
import { TLO_GWIAZDY_PATHS } from './tlo-gwiazdy-svg.js'

// ---------------------------------------------------------------------------
// Kolory: ciepły kremowy dzień i głęboka brązowo-pomarańczowa noc.
// ---------------------------------------------------------------------------
const { theme, problems } = makeColors({
  label: 'Kinto Mode',
  roles: { accent: '#F57C00', danger: '#C62828', success: '#2E7D32', warning: '#B8860B', pro: '#1F4E9E' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#FFE6C7',
        'surface-1': '#FFF0DA',
        'surface-2': '#FFF8EC',
        'surface-3': '#FFF8EC',
        'text-primary': '#2A1405',
        'text-secondary': '#5A3515',
        'text-muted': '#6E4720',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#1E0F05',
        'surface-1': '#2A170A',
        'surface-2': '#351F0F',
        'surface-3': '#3F2714',
        'text-primary': '#FFEBD2',
        'text-secondary': '#E8CBA6',
        'text-muted': '#C4A47D',
      },
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'gory', glass: { blur: 14, opacity: 0.72 } },
}

// ---------------------------------------------------------------------------
// Reakcje na zdarzenia. Tu ustawiasz, co się dzieje przy każdym z nich:
// dźwięk (plik z folderu sounds/) i powiadomienie. {n} to poziom mocy lub liczba kul.
// Pusty dźwięk albo toast = brak. Dźwięki grają tam, gdzie aplikacja ma odtwarzacz.
// ---------------------------------------------------------------------------
type Reakcja = { dzwiek?: string; toast?: string }

const EVENTY: Record<string, Reakcja> = {
  start: { dzwiek: 'sounds/start.wav' },
  koniec: { dzwiek: 'sounds/koniec.wav', toast: 'Kamehameha! Tura zakończona.' },
  poziom: { dzwiek: 'sounds/poziom.wav', toast: 'Poziom mocy: {n}' },
  kompakt: { dzwiek: 'sounds/kompakt.wav', toast: 'Kontekst skompresowany: moc spada.' },
  kula: { dzwiek: 'sounds/kula.wav', toast: 'Smocza kula zebrana: {n}' },
  shenron: { dzwiek: 'sounds/shenron.wav', toast: 'Wszystkie smocze kule zebrane! Shenron się pojawia.' },
}

const reaguj = async ($: EngineInterface, nazwa: string, n?: string | number): Promise<void> => {
  const r = EVENTY[nazwa]

  if (r === undefined) {
    return
  }

  if (r.toast !== undefined && r.toast !== '') {
    $.ui.toast(r.toast.replace('{n}', String(n ?? '')))
  }

  if (r.dzwiek !== undefined && r.dzwiek !== '') {
    $.audio.play({ asset: r.dzwiek }).catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Stan.
// ---------------------------------------------------------------------------
const phase = atom({ plugin: 'goku', key: 'phase' } as const, 'idle')
const percent = atom({ plugin: 'goku', key: 'percent' } as const, 0)
const level = atom({ plugin: 'goku', key: 'level' } as const, 0)
const plan = atom({ plugin: 'goku', key: 'plan' } as const, [], { shape: 'plan-1' })
// Chwila (ms), w której zebrano wszystkie kule; 0 = nie zebrano. Przelot Shenrona trwa raz.
const shenronAt = atom({ plugin: 'goku', key: 'shenronAt' } as const, 0)
// Chwile (ms), w których pojawiły się kolejne kule wokół czatu (indeks = numer kuli).
const kuleAt = atom({ plugin: 'goku', key: 'kuleAt' } as const, [], { shape: 'kule-1' })
// Licznik wymuszający przerysowanie tła (po finale kul scena musi się odświeżyć, żeby pokazać Shenrona).
const odswiez = atom({ plugin: 'goku', key: 'odswiez' } as const, 0)
// Klatka błysku paska mocy po awansie na wyższy poziom (0 = brak błysku).
const mocBlysk = atom({ plugin: 'goku', key: 'mocBlysk' } as const, 0)
const BLYSK_KLATEK = 12
const BLYSK_MS = 350
const blyskMocy = ($: EngineInterface, klatka = 1): void => {
  update($, mocBlysk, () => (klatka > BLYSK_KLATEK ? 0 : klatka)).catch(() => undefined)
  if (klatka <= BLYSK_KLATEK) {
    $.clock.after(BLYSK_MS, () => blyskMocy($, klatka + 1))
  }
}
// Test: wymuszony Super Saiyan (/moc-kinto ssj), niezależnie od poziomu mocy.
const ssjTest = atom({ plugin: 'goku', key: 'ssjTest' } as const, false)
const SSJ_PROG = 90
const isFlying = atom({ plugin: 'goku', key: 'isFlying' } as const, false)
const isStyled = atom({ plugin: 'goku', key: 'isStyled' } as const, false)
// Wybrane tło: 'auto' (według pory dnia), 'zachod', 'zmierzch' albo 'noc'.
const tlo = atom({ plugin: 'goku', key: 'tlo' } as const, 'auto')

const TLA = ['auto', 'zachod', 'zmierzch', 'noc'] as const
type Tlo = (typeof TLA)[number]

const PLAN_TOOL = 'mcp__ccd_turn__update_plan'

// Poziom mocy to po prostu procent użytego kontekstu.
const moc = (pct: number): string => `${Math.round(pct)}%`

// ---------------------------------------------------------------------------
// Scena. Zasady latania:
//  1. Gdy Claude nie pracuje, Goku wisi w oddali i leniwie się unosi.
//  2. Gdy pracuje (turn.start do turn.complete), Goku ruszy z miejsca i przelatuje przez scenę.
//  3. Po zakończeniu tury Goku odpala Kamehameha (jednorazowy błysk).
//  4. /aura-kinto włącza lot ciągły. Przy ograniczeniu ruchu stoi w miejscu.
//  5. Po zebraniu wszystkich smoczych kul Shenron leniwie przepływa w oddali.
//  6. Wieczorem i w nocy niebo ciemnieje i pojawiają się gwiazdy.
// ---------------------------------------------------------------------------
// Małe gwiazdy rozsiane po czystym niebie, każda miga we własnym rytmie.
// Pozycje i rytmy są stałe (generator pseudolosowy z ziarnem), więc wygląd nie zmienia się przy odświeżeniu.
type Pas = { x0: number; x1: number; y0: number; y1: number; n: number }

const gwiazdy = (PASY: Pas[], ziarno: number): string => {
  let seed = ziarno
  const los = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648

    return seed / 2147483648
  }

  return PASY.flatMap((p) => Array.from({ length: p.n }, (_, i) => ({
    x: p.x0 + (i + 0.15 + 0.7 * los()) * ((p.x1 - p.x0) / p.n),
    y: p.y0 + (p.y1 - p.y0) * los(),
  }))).map(({ x, y }) => {
    const r = 0.025 + 0.065 * los() ** 2

    return `<circle class="st" style="animation-duration:${(2.2 + 3.2 * los()).toFixed(1)}s;animation-delay:-${(5 * los()).toFixed(1)}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}"/>`
  }).join('')
}

// Zmierzch: czyste niebo to purpurowe prześwity między chmurami (pas przy górnej krawędzi,
// róg po lewej i dwie szczeliny między chmurami).
const STARS_ZMIERZCH = gwiazdy(
  [
    { x0: 2, x1: 36, y0: 2, y1: 4.5, n: 3 },
    { x0: 90, x1: 172, y0: 2, y1: 5, n: 9 },
    { x0: 90, x1: 108, y0: 6, y1: 12, n: 4 },
    { x0: 148, x1: 166, y0: 6, y1: 16, n: 6 },
  ],
  7,
)

// Noc: niebo zajmuje górne ok. 45% obrazu (horyzont z łuną jest na y ok. 36–42). Po lewej stoi duże
// drzewo (x do ok. 58), więc gwiazdy rozsiewamy na prawo od niego, od góry do tuż nad łuną.
const STARS_NOC = gwiazdy(
  [
    { x0: 62, x1: 172, y0: 2, y1: 14, n: 22 },
    { x0: 62, x1: 172, y0: 14, y1: 33, n: 22 },
  ],
  11,
)

// Shenron: rozplątany smok. Ciało to jedna gładka wstęga (trzy warstwy: grzbiet, tło i brzuch), której kształt
// animuje CSS-owa własność `d` po klatkach falującej sinusoidy, więc fala biegnie od głowy do ogona. Głowa to
// wektorowy obrys z ComfyUI (shenron-svg.ts), który kiwa się razem z falą (klasa fg).
const SHEN_LOT = 45 // sekundy jednego przelotu
const SHEN_DL = 72 // długość ciała od ogona (końcówka chowa się pod głową)
const SHEN_GX = 66 // gdzie siedzi głowa
const SHEN_T = 4.5 // okres fali w sekundach
const SHEN_A = 4.2 // amplituda fali przy ogonie
const SHEN_K = (2 * Math.PI) / 40 // fala ma 40 jednostek długości
const SHEN_KL = 8 // klatek na okres fali
const SHEN_PT = 11 // punktów na brzeg ciała

const shenX = Array.from({ length: SHEN_PT }, (_, j) => (SHEN_DL * j) / (SHEN_PT - 1))
const shenW = (x: number): number => 0.4 + 4.9 * (x / SHEN_DL) ** 1.4 // połowa grubości ciała
// Amplituda maleje ku głowie (szyja faluje słabiej), więc głowa pochyla się łagodniej.
const shenY = (x: number, f: number): number =>
  SHEN_A * (1 - 0.7 * (x / SHEN_DL) ** 2) * Math.sin(SHEN_K * x + (2 * Math.PI * f) / SHEN_KL)

// Jedna warstwa w klatce f: od ogona do szyi górnym brzegiem i z powrotem dolnym. gora i dol to ułamki
// połowy grubości względem osi ciała (-1 = grzbiet, 1 = brzuch).
const shenPath = (f: number, gora: number, dol: number, od = 0): string => {
  const xs = shenX.filter(x => x >= od)
  // Współrzędne w dziesiątych częściach jednostki (całkowite), a element skaluje je z powrotem: krótszy zapis.
  const p = (x: number, u: number): number[] => [x * 10, (shenY(x, f) + u * shenW(x)) * 10]
  const pts = [...xs.map(x => p(x, gora)), ...xs.map(x => p(x, dol)).reverse()]
  const n = (v: number): string => String(Math.round(v))
  // Zamknięty obrys wygładzony krzywymi: punkty są kontrolne, a krzywa przechodzi przez ich środki.
  const mid = (a: number[], b: number[]): string => `${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}`
  let d = `M${mid(pts[pts.length - 1], pts[0])}`

  pts.forEach((q, i) => {
    d += `Q${n(q[0])} ${n(q[1])} ${mid(q, pts[(i + 1) % pts.length])}`
  })

  return `${d}Z`
}

const SHEN_WARSTWY = [
  { id: 'sb', kolor: '#b2e072', gora: -1, dol: 1, od: 0 },
  { id: 'sg', kolor: '#75c765', gora: -1, dol: -0.15, od: 0 },
  { id: 'sr', kolor: '#f4f5c4', gora: 0.25, dol: 0.92, od: 14 },
] as const

const shenCss = (): string => {
  let css = ''

  for (const w of SHEN_WARSTWY) {
    css += `@keyframes ${w.id}{`

    for (let f = 0; f <= SHEN_KL; f++) {
      css += `${((f / SHEN_KL) * 100).toFixed(0)}%{d:path("${shenPath(f % SHEN_KL, w.gora, w.dol, w.od)}")}`
    }

    css += '}'
  }

  css += '@keyframes fg{'

  for (let f = 0; f <= SHEN_KL; f++) {
    const y = shenY(SHEN_GX, f % SHEN_KL)
    const kat = (Math.atan(shenY(SHEN_GX + 0.5, f % SHEN_KL) - shenY(SHEN_GX - 0.5, f % SHEN_KL)) * 180) / Math.PI
    css += `${((f / SHEN_KL) * 100).toFixed(0)}%{transform:translate(${SHEN_GX}px,${y.toFixed(1)}px) rotate(${kat.toFixed(1)}deg)}`
  }

  return `${css}}`
}

const shenronFor = (elapsed: number): string => {
  const op = `style="animation-delay:-${(elapsed % SHEN_T).toFixed(2)}s"`
  const ciało = SHEN_WARSTWY.map(
    w => `<path class="${w.id}" fill="${w.kolor}" transform="scale(.1)" d="${shenPath(0, w.gora, w.dol, w.od)}" ${op}/>`,
  ).join('')
  const glowa =
    `<g class="fg" transform="translate(${SHEN_GX} 0)" ${op}>` +
    '<g transform="scale(.055) translate(0 -135)"><clipPath id="fh"><rect width="330" height="300"/></clipPath>' +
    '<linearGradient id="fn2" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="75" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>' +
    '<mask id="fn" maskUnits="userSpaceOnUse" x="0" y="0" width="330" height="345"><rect width="330" height="345" fill="url(#fn2)"/></mask>' +
    `<g clip-path="url(#fh)" mask="url(#fn)">${SHENRON_PATHS}</g></g></g>`

  return (
    `<g class="sh" style="animation-delay:-${elapsed.toFixed(2)}s"><g mask="url(#fm)" filter="url(#fs)" opacity=".85">` +
    `<g transform="translate(10 20) scale(.7)"><g filter="url(#fk)">${ciało}${glowa}</g></g></g></g>`
  )
}

// Smocze kule: bursztynowa kula (wygląd z ComfyUI) z czerwonymi gwiazdkami. Kule lewitują wokół czatu,
// na przemian po lewej i po prawej, w różnych rozmiarach. Po ukończeniu listy bieleją, rozbłyskują i znikają,
// a dopiero potem wypływa Shenron.
const KULE_KONIEC = 7.5 // sekundy finału kul przed Shenronem
const odswiezPoKulach = ($: EngineInterface): void => {
  $.clock.after(KULE_KONIEC * 1000 + 300, () => {
    update($, odswiez, n => n + 1).catch(() => undefined)
  })
}
const KULE_POZ = [
  { x: 52, y: 30, s: 0.62 },
  { x: 122, y: 20, s: 0.48 },
  { x: 49, y: 54, s: 0.4 },
  { x: 125, y: 46, s: 0.7 },
  { x: 58, y: 14, s: 0.52 },
  { x: 119, y: 68, s: 0.44 },
  { x: 56, y: 70, s: 0.58 },
] as const
// Układ gwiazdek w kuli (promień kuli = 10): [x, y, rozmiar].
const KULE_GW: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[0, 0, 3.4]],
  [[-3.4, 0, 2.4], [3.4, 0, 2.4]],
  [[0, -3.3, 2.2], [-3.4, 2.6, 2.2], [3.4, 2.6, 2.2]],
  [[-3.2, -3.2, 2.2], [3.2, -3.2, 2.2], [-3.2, 3.2, 2.2], [3.2, 3.2, 2.2]],
  [[0, -4.4, 2], [4.2, -1.4, 2], [2.6, 3.6, 2], [-2.6, 3.6, 2], [-4.2, -1.4, 2]],
  [[-3.6, -4.2, 1.8], [3.6, -4.2, 1.8], [-3.6, 0, 1.8], [3.6, 0, 1.8], [-3.6, 4.2, 1.8], [3.6, 4.2, 1.8]],
  [[0, 0, 1.7], [0, -4.7, 1.7], [4.1, -2.35, 1.7], [4.1, 2.35, 1.7], [0, 4.7, 1.7], [-4.1, 2.35, 1.7], [-4.1, -2.35, 1.7]],
]

const KULE_DEFS =
  '<radialGradient id="kb" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#FFD94F"/><stop offset=".6" stop-color="#FFB414"/><stop offset="1" stop-color="#F28C0A"/></radialGradient>' +
  '<radialGradient id="kgl"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#FFE9A0" stop-opacity=".6"/><stop offset="1" stop-color="#FFB347" stop-opacity="0"/></radialGradient>' +
  '<path id="ks" d="M0-1L.22-.31.95-.31.36.12.59.81 0 .38-.59.81-.36.12-.95-.31-.22-.31Z"/>' +
  '<g id="kk"><circle r="10" fill="url(#kb)"/>' +
  '<ellipse cx="-3.4" cy="-4.6" rx="3.3" ry="1.9" fill="#fff" opacity=".8" transform="rotate(-38 -3.4 -4.6)"/>' +
  '<circle cx="4.5" cy="5.5" r="1" fill="#fff" opacity=".5"/>' +
  '<circle r="9.7" fill="none" stroke="#C96A06" stroke-opacity=".5" stroke-width=".6"/></g>'

// Jedna kula: age = sekundy od pojawienia się, fin = sekundy od startu finału (null = bez finału).
const kulaFor = (i: number, age: number, fin: number | null, t: number): string => {
  const p = KULE_POZ[i]
  const gw = KULE_GW[i]
    .map(([x, y, r]) => `<use href="#ks" transform="translate(${x} ${y}) scale(${r})"/>`)
    .join('')
  const ap = `style="animation-delay:-${Math.max(0, age).toFixed(2)}s"`
  const dur = 3.4 + 0.5 * i
  const lew = `style="animation-duration:${dur.toFixed(1)}s;animation-delay:-${((t / 1000 + i * 0.9) % dur).toFixed(2)}s"`
  const f = fin === null ? '' : `style="animation-delay:-${fin.toFixed(2)}s"`
  const kula =
    '<use href="#kk"/>' +
    `<g fill="#D32F1E" stroke="#7A0E0A" stroke-width=".12" stroke-linejoin="round">${gw}</g>` +
    (fin === null ? '' : `<circle class="kw" r="10" fill="#fff" ${f}/>`)

  return (
    `<g transform="translate(${p.x} ${p.y}) scale(${p.s})">` +
    `<g class="${fin === null ? 'kz0' : 'kz'}" ${f}><g class="kp" ${ap}><g class="kl" ${lew}>${kula}</g></g></g>` +
    (fin === null ? '' : `<circle class="kr" r="10" fill="url(#kgl)" ${f}/>`) +
    '</g>'
  )
}

// Wszystkie kule widoczne teraz. czasy: chwile pojawienia się; fin: sekundy od startu finału (null = brak).
const kuleFor = (teraz: number, czasy: readonly number[], fin: number | null, ile: number): string => {
  if (fin !== null && fin >= KULE_KONIEC) {
    return ''
  }

  const n = fin === null ? czasy.length : ile

  return Array.from({ length: n }, (_, i) => {
    const age = czasy[i] !== undefined ? (teraz - czasy[i]) / 1000 : (fin ?? 0) - 0.25 * i

    return kulaFor(i, age, fin, teraz)
  }).join('')
}

const STYLE =
  '<style>' +
  '@keyframes kp{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3);opacity:1}100%{transform:scale(1);opacity:1}}' +
  '@keyframes lew{0%,100%{transform:translateY(-1.6px)}50%{transform:translateY(1.6px)}}' +
  `@keyframes bielej{0%{opacity:0}80%{opacity:.85}100%{opacity:1}}` +
  '@keyframes znika{0%,84%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.7)}}' +
  '@keyframes rozb{0%,70%{opacity:0;transform:scale(.5)}86%{opacity:1;transform:scale(3)}100%{opacity:0;transform:scale(5)}}' +
  '.kp,.kl,.kz,.kr{transform-box:fill-box;transform-origin:center}' +
  '.kp{animation:kp .9s ease-out 1 both}' +
  '.kl{animation:lew 4s ease-in-out infinite}' +
  `.kz{animation:znika ${KULE_KONIEC}s linear 1 forwards}` +
  `.kw{animation:bielej ${KULE_KONIEC}s linear 1 forwards;opacity:0}` +
  `.kr{opacity:0;animation:rozb ${KULE_KONIEC}s linear 1 forwards}` +
  '@keyframes unos{0%,100%{transform:translate(0px,0px) rotate(0deg)}50%{transform:translate(1.4px,-1.8px) rotate(1deg)}}' +
  '@keyframes przelot{' +
  '0%,5%{transform:translate(0px,0px);animation-timing-function:cubic-bezier(.55,0,.85,.5)}' +
  '76%{transform:translate(150px,-5px)}' +
  '76.01%{transform:translate(-45px,7px);animation-timing-function:cubic-bezier(.2,.5,.4,1)}' +
  '100%{transform:translate(0px,0px)}}' +
  '@keyframes fala{0%,100%{transform:translateY(-2.5px) rotate(-6deg)}50%{transform:translateY(3px) rotate(6deg)}}' +
  '@keyframes kame{0%{transform:scale(.2);opacity:.95}100%{transform:scale(2.6);opacity:0}}' +
  '@keyframes ssp{0%,100%{transform:scale(.85);opacity:.7}50%{transform:scale(1.25);opacity:1}}' +
  '@keyframes ssb{0%,100%{opacity:.05}50%{opacity:.2}}' +
  '.ss{transform-box:fill-box;transform-origin:center;animation:ssp .9s ease-in-out infinite}' +
  '.ssb{animation:ssb 1.6s ease-in-out infinite}' +
  '@keyframes blysk{0%,100%{opacity:.25}50%{opacity:1}}' +
  '@keyframes smok{0%{transform:translateX(-110px)}100%{transform:translateX(250px)}}' +
  shenCss() +
  '.gk,.fl,.kf{transform-box:fill-box;transform-origin:center}' +
  '.idle .gk{animation:unos 6s ease-in-out infinite}' +
  '.work .fl{animation:przelot 10s linear infinite}' +
  '.work .gk{animation:fala 2.4s ease-in-out infinite}' +
  '.kf{animation:kame 1.8s ease-out forwards}' +
  '.st{fill:#FFF6D8;animation:blysk 3.4s ease-in-out infinite}' +
  `.sh{animation:smok ${SHEN_LOT}s linear 1 forwards}` +
  `.sb{animation:sb ${SHEN_T}s linear infinite}.sg{animation:sg ${SHEN_T}s linear infinite}.sr{animation:sr ${SHEN_T}s linear infinite}` +
  `.fg{transform-box:fill-box;transform-origin:0% 36.5%;animation:fg ${SHEN_T}s linear infinite}` +
  '@media (prefers-reduced-motion:reduce){.gk,.fl,.kf,.st,.sh,.sb,.sg,.sr,.fg,.kp,.kl,.kz,.kw,.kr,.ss,.ssb{animation:none!important}}' +
  '</style>'

// shenronSek: ile sekund minęło od zebrania wszystkich kul (null = Shenron się nie pokazuje).
type Grafika = 'zachod' | 'zmierzch' | 'noc'
type Opis = { phase: string; grafika: Grafika; shenronSek: number | null; isFlying: boolean; kule: string; teraz: number; ssj: boolean }

// Rozstrzyga, którą grafikę pokazać: wybór użytkownika albo pora dnia przy 'auto'
// (zachód 6–19, zmierzch 19–22, noc 22–6).
const grafikaFor = (wybor: string, hour: number): Grafika =>
  wybor === 'zachod' || wybor === 'zmierzch' || wybor === 'noc'
    ? wybor
    : hour >= 22 || hour < 6
      ? 'noc'
      : hour >= 19
        ? 'zmierzch'
        : 'zachod'

const TLA_SVG: Record<Grafika, string> = {
  zachod: TLO_PATHS,
  zmierzch: TLO_NOC_PATHS,
  noc: TLO_GWIAZDY_PATHS,
}

const sceneFor = (o: Opis): string => {
  const mode = o.phase === 'work' || o.isFlying ? 'work' : 'idle'
  const defs =
    '<defs><filter id="b" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="0.55"/></filter>' +
    '<filter id="g" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="0.1"/></filter>' +
    '<filter id="fs" filterUnits="userSpaceOnUse" x="-300" y="0" width="700" height="90"><feGaussianBlur stdDeviation="0.3"/></filter>' +
    '<filter id="fk" filterUnits="userSpaceOnUse" x="-300" y="-40" width="700" height="80"><feGaussianBlur stdDeviation="0.25"/></filter>' +
    '<linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F8A3A"/><stop offset=".6" stop-color="#4FB04F"/><stop offset="1" stop-color="#E6C27A"/></linearGradient>' +
    '<linearGradient id="fg" gradientUnits="userSpaceOnUse" x1="0" y1="46" x2="0" y2="60"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>' +
    '<mask id="fm" maskUnits="userSpaceOnUse" x="-500" y="0" width="1200" height="90"><rect x="-500" y="0" width="1200" height="90" fill="url(#fg)"/></mask>' +
    '<radialGradient id="ssg"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset=".35" stop-color="#FFE04A" stop-opacity=".85"/><stop offset="1" stop-color="#FFB000" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="ki"><stop offset="0" stop-color="#FFF6C8"/><stop offset=".5" stop-color="#FFD25A" stop-opacity=".8"/><stop offset="1" stop-color="#FF9F1C" stop-opacity="0"/></radialGradient>' + KULE_DEFS + '</defs>'

  const night =
    o.grafika === 'zmierzch'
      ? '<rect x="0" y="0" width="180" height="90" fill="#12063A" opacity="0.14"/>' + STARS_ZMIERZCH
      : o.grafika === 'noc'
        ? STARS_NOC
        : ''

  const ssjTlo = o.ssj ? '<rect class="ssb" x="0" y="0" width="180" height="90" fill="#FFD94F"/>' : ''
  const ssjAura = o.ssj ? '<circle class="ss" cx="34" cy="33" r="11" fill="url(#ssg)"/>' : ''
  const shenron = o.shenronSek !== null && o.shenronSek < SHEN_LOT ? shenronFor(o.shenronSek) : ''
  const kame = o.phase === 'done' ? '<g class="kf"><circle cx="34" cy="33" r="7" fill="url(#ki)"/></g>' : ''

  return (
    // Noc przyciąga widok do góry, żeby przy szerokim oknie nie ucinać nieba.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1.8 1.5 172.4 81" preserveAspectRatio="${o.grafika === 'noc' ? 'xMidYMin' : 'xMidYMid'} slice">` +
    defs +
    STYLE +
    `<g filter="url(#b)">${TLA_SVG[o.grafika]}</g>` +
    night +
    ssjTlo +
    shenron +
    `<g class="${mode}"><g class="fl" style="animation-delay:-${((o.teraz / 1000) % 10).toFixed(2)}s"><g class="gk" style="animation-delay:-${((o.teraz / 1000) % (mode === 'work' ? 2.4 : 6)).toFixed(2)}s">${ssjAura}<g transform="translate(29 28) scale(0.052)" filter="url(#g)">${GOKU_PATHS}</g></g></g></g>` +
    kame +
    o.kule +
    '</svg>'
  )
}

// ---------------------------------------------------------------------------
// Pomocnicze: stan listy zadań (smocze kule).
// ---------------------------------------------------------------------------
const applyPlan = (cur: readonly string[], input: Record<string, unknown>): string[] => {
  const s = Array.isArray(input.items)
    ? input.items.map(x => String((x as { status?: unknown } | null)?.status ?? 'pending'))
    : [...cur]

  if (input.advance === true) {
    const a = s.indexOf('in_progress')

    if (a >= 0) {
      s[a] = 'completed'
    }
    const n = s.indexOf('pending')

    if (n >= 0) {
      s[n] = 'in_progress'
    }
  }

  if (Array.isArray(input.done)) {
    for (const d of input.done) {
      if (typeof d === 'number' && s[d - 1] !== undefined) {
        s[d - 1] = 'completed'
      }
    }
  }

  if (typeof input.start === 'number' && s[input.start - 1] !== undefined) {
    s[input.start - 1] = 'in_progress'
  }

  return s
}


const STYL =
  'Dodatkowy styl (motyw Kinto Mode): odpowiadaj normalnie i rzeczowo, ale możesz od czasu do czasu ' +
  'dodać krótkie, lekkie nawiązanie do Dragon Ball (np. o „poziomie mocy” zadania). Nie wpływa to na treść techniczną.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const set = await $.theme.set(LOOK)

    if (!set.isDrawn) {
      $.ui.toast(`Goku: nie rysuje się: ${set.reason}`)
    }

    await $.command.register({
      name: 'aura-kinto',
      description: 'Goku: /aura-kinto = lot ciągły, /aura-kinto styl = lekki styl Dragon Ball w odpowiedziach',
    })

    await $.command.register({
      name: 'shenron-kinto',
      description: 'Goku: /shenron-kinto = przywołaj Shenrona (test), /shenron-kinto stop = odeślij',
    })

    await $.command.register({
      name: 'moc-kinto',
      description: 'Goku: /moc-kinto = stan mocy, /moc-kinto ssj = test Super Saiyana, /moc-kinto blysk = test błysku paska',
    })

    await $.command.register({
      name: 'tlo-kinto',
      description: 'Goku: /tlo-kinto auto|zachod|zmierzch|noc = wybór tła',
    })

    return next(e)
  })

  // Test i zabawa: przywołuje Shenrona bez zbierania kul. /shenron-kinto stop kończy przelot.
  on('command.run', { command: 'shenron-kinto' }, async ($, e) => {
    if (e.args.trim() === 'stop') {
      await update($, shenronAt, () => 0)

      return { text: 'Shenron odleciał.' }
    }
    await update($, shenronAt, () => Date.now())
    odswiezPoKulach($)
    await reaguj($, 'shenron')

    return { text: 'Shenron przywołany. Przelot trwa ok. 45 sekund.' }
  })

  on('command.run', { command: 'moc-kinto' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const pct = await read($, percent)

    if (arg === 'ssj') {
      const now = !(await read($, ssjTest))
      await update($, ssjTest, () => now)

      return { text: now ? 'Super Saiyan (test) włączony.' : 'Super Saiyan (test) wyłączony.' }
    }

    if (arg === 'blysk') {
      blyskMocy($)

      return { text: 'Błysk paska mocy.' }
    }

    return {
      text: `Moc ${moc(pct)}. Super Saiyan od ${SSJ_PROG}%. Test: /moc-kinto ssj albo /moc-kinto blysk.`,
    }
  })

  on('command.run', { command: 'tlo-kinto' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const cur = await read($, tlo)

    if (arg === '') {
      return { text: `Tło: ${cur}. Wybierz: ${TLA.join(', ')}. Przykład: /tlo-kinto zmierzch` }
    }

    if (!(TLA as readonly string[]).includes(arg)) {
      return { text: `Nie znam tła „${arg}". Dostępne: ${TLA.join(', ')}.` }
    }
    await update($, tlo, () => arg as Tlo)

    const OPIS: Record<string, string> = {
      auto: 'Tło: auto (zachód 6–19, zmierzch 19–22, noc 22–6).',
      zachod: 'Tło: zachód słońca.',
      zmierzch: 'Tło: zmierzch z gwiazdami.',
      noc: 'Tło: gwiaździsta noc.',
    }

    return { text: OPIS[arg] ?? '' }
  })

  on('command.run', { command: 'aura-kinto' }, async ($, e) => {
    if (e.args.trim() === 'styl') {
      const now = !(await read($, isStyled))
      await update($, isStyled, () => now)

      return { text: now ? 'Styl Dragon Ball włączony.' : 'Styl Dragon Ball wyłączony.' }
    }
    const now = !(await read($, isFlying))
    await update($, isFlying, () => now)

    return { text: now ? 'Aura włączona: Goku leci cały czas.' : 'Aura wyłączona: Goku leci tylko, gdy Claude pracuje.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, phase, () => 'work')
    await reaguj($, 'start')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, phase, () => 'done')
    await reaguj($, 'koniec')

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    // e.context.percent liczy względem całego okna modelu (np. 1M), a aplikacja pokazuje
    // użycie względem okna kompresji (np. 500k). Bierzemy to samo, co aplikacja: breakdown.
    let raw = e.context.percent

    try {
      const usage = await $.session.usage({ breakdown: 'summary' })
      raw = usage.context.breakdown?.percentage ?? raw
    } catch {
      // zostaje procent z pomiaru
    }

    if (raw !== undefined) {
      const pct = Math.round(raw)
      const prev = await read($, level)
      const lv = pct >= 90 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0
      await update($, percent, () => pct)

      if (lv > prev) {
        await reaguj($, 'poziom', moc(pct))
        blyskMocy($)

        if (lv === 4) {
          $.ui.toast('SUPER SAIYAN! Moc przekroczyła 90%.')
        }
      }

      if (lv !== prev) {
        await update($, level, () => lv)
      }
      $.ui.status(`Moc ${moc(pct)}`)
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const wynik = await next(e)

    // Pomiar (session.measure) przychodzi dopiero przy następnej turze, więc pasek
    // trzymałby starą wartość. Po udanej kompresji przeliczamy moc od razu.
    if (wynik && 'messages' in wynik && wynik.messages) {
      const prev = await read($, percent)
      let pct: number | undefined

      try {
        const usage = await $.session.usage({ breakdown: 'summary' })
        const p = usage.context.breakdown?.percentage

        // Zwykłe użycie może jeszcze zwracać stan sprzed kompresji: wtedy liczymy z proporcji.
        if (p !== undefined && p < prev) {
          pct = Math.round(p)
        }
      } catch {
        // zostaje szacunek
      }

      if (pct === undefined && wynik.tokensBefore && wynik.tokensAfter !== undefined) {
        pct = Math.round(prev * (wynik.tokensAfter / wynik.tokensBefore))
      }

      if (pct !== undefined) {
        const lv = pct >= 90 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct >= 25 ? 1 : 0
        await update($, percent, () => pct as number)
        await update($, level, () => lv)
        $.ui.status(`Moc ${moc(pct)}`)
      }

      await reaguj($, 'kompakt')
    }

    return wynik
  })

  on('tool.call', { tool: PLAN_TOOL }, async ($, e, next) => {
    const before = await read($, plan)
    const after = applyPlan(before, e as unknown as Record<string, unknown>)
    await update($, plan, () => after)

    // Kule wokół czatu: ile ukończonych zadań, tyle (proporcjonalnie, maks. 7) kul.
    // Zawsze 7 kul, rozłożonych równo między kroki (np. 3 kroki dają 2, 2 i 3 kule; ostatni krok dostaje resztę).
    const N = after.length
    const widoczne = N > 0 ? Math.floor((after.filter(s => s === 'completed').length * 7) / N) : 0
    const teraz0 = await $.clock.now()
    const stare = await read($, kuleAt)
    await update($, kuleAt, () => Array.from({ length: widoczne }, (_, i) => stare[i] ?? teraz0))

    const was = before.filter(s => s === 'completed').length
    const now = after.filter(s => s === 'completed').length
    const isAll = after.length > 0 && now === after.length
    const wasAll = before.length > 0 && was === before.length

    if (now > was && !isAll) {
      await reaguj($, 'kula', `${now}/${after.length}`)
    }

    if (isAll && !wasAll) {
      const teraz = await $.clock.now()
      await update($, shenronAt, () => teraz)
      odswiezPoKulach($)
      await reaguj($, 'shenron')
    } else if (!isAll) {
      await update($, shenronAt, () => 0)
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)

    if (!(await read($, isStyled))) {
      return out
    }

    return { ...out, sections: [...out.sections, { id: 'goku:styl', text: STYL, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)
    const teraz = await $.clock.now()
    const hour = new Date(teraz).getHours()
    const kiedy = await read($, shenronAt)

    const minelo = kiedy > 0 ? Math.max(0, (teraz - kiedy) / 1000) : null
    const lista = await read($, plan)
    const czasy = await read($, kuleAt)
    await read($, odswiez)
    // Finał kul (bielenie, rozbłysk, zniknięcie) trwa KULE_KONIEC sekund, potem wypływa Shenron.
    const kule = kuleFor(teraz, czasy, minelo, 7)

    const source = sceneFor({
      phase: await read($, phase),
      grafika: grafikaFor(await read($, tlo), hour),
      shenronSek: minelo === null || minelo < KULE_KONIEC ? null : minelo - KULE_KONIEC,
      isFlying: await read($, isFlying),
      kule,
      teraz,
      ssj: (await read($, percent)) >= SSJ_PROG || (await read($, ssjTest)),
    })

    return <Svg source={source} alt="Góry o zachodzie, pomarańczowe niebo, Goku w locie" />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const pct = await read($, percent)
    const filled = Math.max(0, Math.min(20, Math.round(pct / 5)))
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
    const klatka = await read($, mocBlysk)
    const ssj = pct >= SSJ_PROG || (await read($, ssjTest))

    // Po awansie na wyższy poziom pasek przez kilka sekund miga i ma ramkę z iskrami,
    // żeby było widać, że dźwięk dotyczy wzrostu mocy. Bez ruchu (klatka 0) wraca do zwykłego wyglądu.
    if (klatka > 0) {
      const kolory = ['#FFD94F', '#FFFFFF', '#FF9800', '#FFFFFF']
      const kolor = kolory[klatka % kolory.length]
      const iskry = klatka % 2 === 0 ? '⚡' : '✦'
      return (
        <Box>
          <Text color={kolor} bold backgroundColor={klatka % 2 === 0 ? '#C25A00' : '#8A3F00'}>
            {` ${iskry} MOC ROŚNIE ${moc(pct)} ${bar} ${iskry} `}
          </Text>
        </Box>
      )
    }

    if (ssj) {
      return (
        <Box>
          <Text color="#FFE04A" bold backgroundColor="#8A3F00">
            {` ⚡ SUPER SAIYAN ${moc(pct)} ${bar} ⚡ `}
          </Text>
        </Box>
      )
    }

    return (
      <Box>
        <Text color="#F57C00">
          Moc {moc(pct)}
          {pct >= 90 ? ' (ponad 9000!)' : ''} {bar}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const row = await next(e)

    return (
      <Box flexDirection="column">
        {row}
        <Text color={e.isErrored ? '#C62828' : '#F57C00'} dimColor={!e.isRunning}>
          {e.isRunning ? '◌ ładowanie ki…' : e.isErrored ? '✕ atak nieudany' : '● cios trafił'}
        </Text>
      </Box>
    )
  })
}
