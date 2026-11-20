import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { GOKU_PATHS } from './goku-svg.js'
import { SSJ_HAIR_PATHS } from './ssj-hair-svg.js'
import { SHENRON_PATHS } from './shenron-svg.js'
import { SUNSET_PATHS } from './backdrop-sunset-svg.js'
import { DUSK_PATHS } from './backdrop-dusk-svg.js'
import { NIGHT_PATHS } from './backdrop-night-svg.js'

// ---------------------------------------------------------------------------
// Colours: a warm cream day and a deep brown-orange night.
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
// Reactions to events. Here you set what happens on each of them:
// a sound (a file from the sounds/ folder). Notification texts (toasts) are in the TXT table below, one set per language.
// An empty sound means silence. Sounds play wherever the app has a player.
// ---------------------------------------------------------------------------
type Reaction = { sound?: string }

const EVENTS: Record<string, Reaction> = {
  start: { sound: 'sounds/start.wav' },
  end: { sound: 'sounds/end.wav' },
  level: { sound: 'sounds/level.wav' },
  compact: { sound: 'sounds/compact.wav' },
  ball: { sound: 'sounds/ball.wav' },
  shenron: { sound: 'sounds/shenron.wav' },
}

const react = async ($: EngineInterface, name: string, n?: string | number): Promise<void> => {
  const r = EVENTS[name]

  if (r === undefined) {
    return
  }
  const toast = (await tx($)).toast[name]

  if (toast !== undefined && toast !== '') {
    $.ui.toast(toast.replace('{n}', String(n ?? '')))
  }

  if (r.sound !== undefined && r.sound !== '' && (await soundEnabled($, name))) {
    play($, r.sound)
  }
}

// $.audio.play only works on macOS (afplay); on Windows nothing is heard. There we play the file through
// PowerShell (System.Media.SoundPlayer, PCM WAV files). Windows is recognised by a path with a drive letter.
const play = ($: EngineInterface, file: string): void => {
  const root = $.plugin.root

  if (/^[A-Za-z]:[\\/]/.test(root)) {
    const filePath = `${root}/${file}`.replace(/\//g, '\\').replace(/'/g, "''")
    $.process
      .run(['powershell', '-NoProfile', '-NonInteractive', '-Command', `(New-Object Media.SoundPlayer '${filePath}').PlaySync()`], {
        timeoutMs: 15000,
      })
      .catch(() => undefined)

    return
  }
  $.audio.play({ asset: file }).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------
const phase = atom({ plugin: 'goku', key: 'phase' } as const, 'idle')
const percent = atom({ plugin: 'goku', key: 'percent' } as const, 0)
const level = atom({ plugin: 'goku', key: 'level' } as const, 0)
const plan = atom({ plugin: 'goku', key: 'plan' } as const, [], { shape: 'plan-1' })
// Moment (ms) when all the balls were collected; 0 = not collected. Shenron's flight happens once.
const shenronAt = atom({ plugin: 'goku', key: 'shenronAt' } as const, 0)
// Moments (ms) when each ball appeared around the chat (index = ball number).
const ballsAt = atom({ plugin: 'goku', key: 'ballsAt' } as const, [], { shape: 'balls-1' })
// Counter that forces a backdrop redraw (after the ball finale the scene must refresh to show Shenron).
const refresh = atom({ plugin: 'goku', key: 'refresh' } as const, 0)
// Frame of the power bar flash after reaching a higher level (0 = no flash).
const powerFlash = atom({ plugin: 'goku', key: 'powerFlash' } as const, 0)
const FLASH_STEPS = 12
const FLASH_MS = 350
const flashPower = ($: EngineInterface, step = 1): void => {
  update($, powerFlash, () => (step > FLASH_STEPS ? 0 : step)).catch(() => undefined)
  if (step <= FLASH_STEPS) {
    $.clock.after(FLASH_MS, () => flashPower($, step + 1))
  }
}
// Test: forced Super Saiyan (/power-kinto ssj), regardless of the power level.
const ssjTest = atom({ plugin: 'goku', key: 'ssjTest' } as const, false)
// Power thresholds (%) and the Super Saiyan threshold. Defaults come from the plugin settings
// (userConfig), and /power-kinto thresholds|ssj <n> overrides them until the session ends.
const thresholdsOverride = atom({ plugin: 'goku', key: 'thresholdsOverride' } as const, [] as number[])
const ssjOverride = atom({ plugin: 'goku', key: 'ssjOverride' } as const, 0)
const DEFAULTS = { p1: 25, p2: 50, p3: 75, p4: 90, ssj: 50 }
let settings = { ...DEFAULTS }

type Lang = 'pl' | 'en'
// Language of in-app texts: the plugin setting (language); /lang-kinto pl|en overrides it until the session ends.
const langOverride = atom({ plugin: 'goku', key: 'langOverride' } as const, '')
let langOption: Lang = 'en'

// Sounds: the plugin setting (sounds); /sound-kinto overrides it until the session ends.
// soundOverride: '' = from settings, 'on' / 'off' = forced; mutedOverride = events muted one by one.
const soundOverride = atom({ plugin: 'goku', key: 'soundOverride' } as const, '')
const mutedOverride = atom({ plugin: 'goku', key: 'mutedOverride' } as const, [] as string[])
let soundOption = true

const soundEnabled = async ($: Parameters<typeof read>[0], name: string): Promise<boolean> => {
  const override = await read($, soundOverride)
  const globalOn = override === 'on' ? true : override === 'off' ? false : soundOption

  return globalOn && !(await read($, mutedOverride)).includes(name)
}

const getLang = async ($: Parameters<typeof read>[0]): Promise<Lang> => {
  const v = await read($, langOverride)

  return v === 'pl' || v === 'en' ? v : langOption
}

const clampPct = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.min(100, Math.round(v))) : def

const getThresholds = async ($: Parameters<typeof read>[0]) => {
  const override = await read($, thresholdsOverride)
  const p = override.length === 4 ? [...override] : [settings.p1, settings.p2, settings.p3, settings.p4]
  const s = await read($, ssjOverride)

  return { p, ssj: s > 0 ? s : settings.ssj }
}

const levelFrom = (pct: number, p: readonly number[]): number => p.filter(x => pct >= x).length
const isFlying = atom({ plugin: 'goku', key: 'isFlying' } as const, false)
const isStyled = atom({ plugin: 'goku', key: 'isStyled' } as const, false)
// Chosen backdrop: 'auto' (by time of day), 'sunset', 'dusk' or 'night'.
const backdropChoice = atom({ plugin: 'goku', key: 'backdropChoice' } as const, 'auto')

const BACKDROPS = ['auto', 'sunset', 'dusk', 'night'] as const
type BackdropChoice = (typeof BACKDROPS)[number]

const PLAN_TOOL = 'mcp__ccd_turn__update_plan'

// The power level is simply the percentage of context used.
const power = (pct: number): string => `${Math.round(pct)}%`

// ---------------------------------------------------------------------------
// Scene. Flying rules:
//  1. When Claude is not working, Goku hangs in the distance and lazily floats.
//  2. While Claude works (turn.start to turn.complete), Goku takes off and flies across the scene.
//  3. When the turn ends, Goku fires a Kamehameha (a one-off flash).
//  4. /aura-kinto turns on continuous flight. With reduced motion he stands still.
//  5. After all the Dragon Balls are collected, Shenron lazily drifts across the distance.
//  6. In the evening and at night the sky darkens and stars appear.
// ---------------------------------------------------------------------------
// Small stars scattered over the clear sky, each twinkling at its own rhythm.
// Positions and rhythms are fixed (a seeded pseudo-random generator), so the look does not change on refresh.
type Band = { x0: number; x1: number; y0: number; y1: number; n: number }

const stars = (BANDS: Band[], seedValue: number): string => {
  let seed = seedValue
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648

    return seed / 2147483648
  }

  return BANDS.flatMap((p) => Array.from({ length: p.n }, (_, i) => ({
    x: p.x0 + (i + 0.15 + 0.7 * rand()) * ((p.x1 - p.x0) / p.n),
    y: p.y0 + (p.y1 - p.y0) * rand(),
  }))).map(({ x, y }) => {
    const r = 0.025 + 0.065 * rand() ** 2

    return `<circle class="st" style="animation-duration:${(2.2 + 3.2 * rand()).toFixed(1)}s;animation-delay:-${(5 * rand()).toFixed(1)}s" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}"/>`
  }).join('')
}

// Dusk: the clear sky is purple gaps between the clouds (a band at the top edge,
// a corner on the left and two gaps between the clouds).
const STARS_DUSK = stars(
  [
    { x0: 2, x1: 36, y0: 2, y1: 4.5, n: 3 },
    { x0: 90, x1: 172, y0: 2, y1: 5, n: 9 },
    { x0: 90, x1: 108, y0: 6, y1: 12, n: 4 },
    { x0: 148, x1: 166, y0: 6, y1: 16, n: 6 },
  ],
  7,
)

// Night: the sky takes the top ~45% of the image (the horizon with its glow is at y ~36-42). On the left stands a large
// tree (x up to ~58), so the stars are scattered to the right of it, from the top to just above the glow.
const STARS_NIGHT = stars(
  [
    { x0: 62, x1: 172, y0: 2, y1: 14, n: 22 },
    { x0: 62, x1: 172, y0: 14, y1: 33, n: 22 },
  ],
  11,
)

// Shenron: an untangled dragon. The body is one smooth ribbon (three layers: back, base and belly) whose shape
// is animated by the CSS `d` property over the frames of a travelling sine wave, so the wave runs from head to tail. The head is a
// vector outline from ComfyUI (shenron-svg.ts) that nods along with the wave (class fg).
const SHEN_FLIGHT = 45 // seconds of one flight
const SHEN_LEN = 72 // body length from the tail (the end hides under the head)
const SHEN_GX = 66 // where the head sits
const SHEN_T = 4.5 // wave period in seconds
const SHEN_A = 4.2 // wave amplitude at the tail
const SHEN_K = (2 * Math.PI) / 40 // the wave is 40 units long
const SHEN_KL = 8 // frames per wave period
const SHEN_PT = 11 // points per body edge

const shenX = Array.from({ length: SHEN_PT }, (_, j) => (SHEN_LEN * j) / (SHEN_PT - 1))
const shenW = (x: number): number => 0.4 + 4.9 * (x / SHEN_LEN) ** 1.4 // half the body thickness
// The amplitude shrinks towards the head (the neck waves less), so the head tilts more gently.
const shenY = (x: number, f: number): number =>
  SHEN_A * (1 - 0.7 * (x / SHEN_LEN) ** 2) * Math.sin(SHEN_K * x + (2 * Math.PI * f) / SHEN_KL)

// One layer in frame f: from the tail to the neck along the top edge and back along the bottom. top and bottom are fractions
// of the half thickness relative to the body axis (-1 = back, 1 = belly).
const shenPath = (f: number, top: number, bottom: number, start = 0): string => {
  const xs = shenX.filter(x => x >= start)
  // Coordinates in tenths of a unit (integers), and the element scales them back: a shorter notation.
  const p = (x: number, u: number): number[] => [x * 10, (shenY(x, f) + u * shenW(x)) * 10]
  const pts = [...xs.map(x => p(x, top)), ...xs.map(x => p(x, bottom)).reverse()]
  const n = (v: number): string => String(Math.round(v))
  // A closed outline smoothed with curves: the points are control points and the curve passes through their midpoints.
  const mid = (a: number[], b: number[]): string => `${n((a[0] + b[0]) / 2)} ${n((a[1] + b[1]) / 2)}`
  let d = `M${mid(pts[pts.length - 1], pts[0])}`

  pts.forEach((q, i) => {
    d += `Q${n(q[0])} ${n(q[1])} ${mid(q, pts[(i + 1) % pts.length])}`
  })

  return `${d}Z`
}

const SHEN_LAYERS = [
  { id: 'sb', color: '#b2e072', top: -1, bottom: 1, start: 0 },
  { id: 'sg', color: '#75c765', top: -1, bottom: -0.15, start: 0 },
  { id: 'sr', color: '#f4f5c4', top: 0.25, bottom: 0.92, start: 14 },
] as const

const shenCss = (): string => {
  let css = ''

  for (const w of SHEN_LAYERS) {
    css += `@keyframes ${w.id}{`

    for (let f = 0; f <= SHEN_KL; f++) {
      css += `${((f / SHEN_KL) * 100).toFixed(0)}%{d:path("${shenPath(f % SHEN_KL, w.top, w.bottom, w.start)}")}`
    }

    css += '}'
  }

  css += '@keyframes fg{'

  for (let f = 0; f <= SHEN_KL; f++) {
    const y = shenY(SHEN_GX, f % SHEN_KL)
    const angle = (Math.atan(shenY(SHEN_GX + 0.5, f % SHEN_KL) - shenY(SHEN_GX - 0.5, f % SHEN_KL)) * 180) / Math.PI
    css += `${((f / SHEN_KL) * 100).toFixed(0)}%{transform:translate(${SHEN_GX}px,${y.toFixed(1)}px) rotate(${angle.toFixed(1)}deg)}`
  }

  return `${css}}`
}

const shenronFor = (elapsed: number): string => {
  const op = `style="animation-delay:-${(elapsed % SHEN_T).toFixed(2)}s"`
  const body = SHEN_LAYERS.map(
    w => `<path class="${w.id}" fill="${w.color}" transform="scale(.1)" d="${shenPath(0, w.top, w.bottom, w.start)}" ${op}/>`,
  ).join('')
  const head =
    `<g class="fg" transform="translate(${SHEN_GX} 0)" ${op}>` +
    '<g transform="scale(.055) translate(0 -135)"><clipPath id="fh"><rect width="330" height="300"/></clipPath>' +
    '<linearGradient id="fn2" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="75" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>' +
    '<mask id="fn" maskUnits="userSpaceOnUse" x="0" y="0" width="330" height="345"><rect width="330" height="345" fill="url(#fn2)"/></mask>' +
    `<g clip-path="url(#fh)" mask="url(#fn)">${SHENRON_PATHS}</g></g></g>`

  return (
    `<g class="sh" style="animation-delay:-${elapsed.toFixed(2)}s"><g mask="url(#fm)" filter="url(#fs)" opacity=".85">` +
    `<g transform="translate(10 20) scale(.7)"><g filter="url(#fk)">${body}${head}</g></g></g></g>`
  )
}

// Dragon Balls: an amber ball (look from ComfyUI) with red stars. The balls levitate around the chat,
// alternately on the left and on the right, in different sizes. When the list is complete they turn white, flash and vanish,
// and only then does Shenron appear.
const BALLS_FINALE = 7.5 // seconds of the ball finale before Shenron
const refreshAfterBalls = ($: EngineInterface): void => {
  $.clock.after(BALLS_FINALE * 1000 + 300, () => {
    update($, refresh, n => n + 1).catch(() => undefined)
  })
}
const BALL_POS = [
  { x: 52, y: 30, s: 0.62 },
  { x: 122, y: 20, s: 0.48 },
  { x: 49, y: 54, s: 0.4 },
  { x: 125, y: 46, s: 0.7 },
  { x: 58, y: 14, s: 0.52 },
  { x: 119, y: 68, s: 0.44 },
  { x: 56, y: 70, s: 0.58 },
] as const
// Layout of the stars on a ball (ball radius = 10): [x, y, size].
const BALL_STARS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[0, 0, 3.4]],
  [[-3.4, 0, 2.4], [3.4, 0, 2.4]],
  [[0, -3.3, 2.2], [-3.4, 2.6, 2.2], [3.4, 2.6, 2.2]],
  [[-3.2, -3.2, 2.2], [3.2, -3.2, 2.2], [-3.2, 3.2, 2.2], [3.2, 3.2, 2.2]],
  [[0, -4.4, 2], [4.2, -1.4, 2], [2.6, 3.6, 2], [-2.6, 3.6, 2], [-4.2, -1.4, 2]],
  [[-3.6, -4.2, 1.8], [3.6, -4.2, 1.8], [-3.6, 0, 1.8], [3.6, 0, 1.8], [-3.6, 4.2, 1.8], [3.6, 4.2, 1.8]],
  [[0, 0, 1.7], [0, -4.7, 1.7], [4.1, -2.35, 1.7], [4.1, 2.35, 1.7], [0, 4.7, 1.7], [-4.1, 2.35, 1.7], [-4.1, -2.35, 1.7]],
]

const BALL_DEFS =
  '<radialGradient id="kb" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#FFD94F"/><stop offset=".6" stop-color="#FFB414"/><stop offset="1" stop-color="#F28C0A"/></radialGradient>' +
  '<radialGradient id="kgl"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#FFE9A0" stop-opacity=".6"/><stop offset="1" stop-color="#FFB347" stop-opacity="0"/></radialGradient>' +
  '<path id="ks" d="M0-1L.22-.31.95-.31.36.12.59.81 0 .38-.59.81-.36.12-.95-.31-.22-.31Z"/>' +
  '<g id="kk"><circle r="10" fill="url(#kb)"/>' +
  '<ellipse cx="-3.4" cy="-4.6" rx="3.3" ry="1.9" fill="#fff" opacity=".8" transform="rotate(-38 -3.4 -4.6)"/>' +
  '<circle cx="4.5" cy="5.5" r="1" fill="#fff" opacity=".5"/>' +
  '<circle r="9.7" fill="none" stroke="#C96A06" stroke-opacity=".5" stroke-width=".6"/></g>'

// One ball: age = seconds since it appeared, fin = seconds since the finale started (null = no finale).
const ballFor = (i: number, age: number, fin: number | null, t: number): string => {
  const p = BALL_POS[i]
  const pips = BALL_STARS[i]
    .map(([x, y, r]) => `<use href="#ks" transform="translate(${x} ${y}) scale(${r})"/>`)
    .join('')
  const appear = `style="animation-delay:-${Math.max(0, age).toFixed(2)}s"`
  const dur = 3.4 + 0.5 * i
  const hoverStyle = `style="animation-duration:${dur.toFixed(1)}s;animation-delay:-${((t / 1000 + i * 0.9) % dur).toFixed(2)}s"`
  const f = fin === null ? '' : `style="animation-delay:-${fin.toFixed(2)}s"`
  const ball =
    '<use href="#kk"/>' +
    `<g fill="#D32F1E" stroke="#7A0E0A" stroke-width=".12" stroke-linejoin="round">${pips}</g>` +
    (fin === null ? '' : `<circle class="kw" r="10" fill="#fff" ${f}/>`)

  return (
    `<g transform="translate(${p.x} ${p.y}) scale(${p.s})">` +
    `<g class="${fin === null ? 'kz0' : 'kz'}" ${f}><g class="kp" ${appear}><g class="kl" ${hoverStyle}>${ball}</g></g></g>` +
    (fin === null ? '' : `<circle class="kr" r="10" fill="url(#kgl)" ${f}/>`) +
    '</g>'
  )
}

// All the balls visible now. times: moments of appearance; fin: seconds since the finale started (null = none).
const ballsFor = (nowMs: number, times: readonly number[], fin: number | null, count: number): string => {
  if (fin !== null && fin >= BALLS_FINALE) {
    return ''
  }

  const n = fin === null ? times.length : count

  return Array.from({ length: n }, (_, i) => {
    const age = times[i] !== undefined ? (nowMs - times[i]) / 1000 : (fin ?? 0) - 0.25 * i

    return ballFor(i, age, fin, nowMs)
  }).join('')
}

// Super Saiyan: a different hair layout. The dark layer of the Goku artwork (#2d250f) is his black hair and belt,
// so in this mode we keep only the belt (from y=50 down) and put the hair from the ComfyUI artwork on the head (ssj-hair-svg.ts).
const GOKU_SSJ = (() => {
  const layer = /<path[^>]*fill="#2d250f"[^>]*\/>/.exec(GOKU_PATHS)?.[0]

  if (layer === undefined) {
    return GOKU_PATHS
  }

  return (
    GOKU_PATHS.replace(layer, '') +
    `<clipPath id="pas"><rect x="0" y="50" width="200" height="120"/></clipPath><g clip-path="url(#pas)">${layer}</g>` +
    // the black hair layer also covered the back of the head; without it the head is transparent under the ComfyUI hair outline,
    // so put a hair-coloured mass (same yellow and dark gold outline as the hair art) under the new hair
    `<path fill="#ffff67" stroke="#B88400" stroke-width="1.5" stroke-linejoin="round" d="M76 44L81 37L104 35L109 40L106 46L96 50L84 49Z"/>` +
    `<g transform="translate(114 10) scale(-0.27 0.27)">${SSJ_HAIR_PATHS}</g>`
  )
})()

// When the system has reduced motion on (e.g. macOS Reduce motion), the browser stops all animations.
// The motion=always option drops this rule and always animates.
const RM_RULE =
  '@media (prefers-reduced-motion:reduce){.gk,.fl,.kf,.st,.sh,.sb,.sg,.sr,.fg,.kp,.kl,.kz,.kw,.kr,.ss,.ssb{animation:none!important}}'
let motionAlways = false
// The frame=sandbox option draws the backdrop in a frame instead of as an image (Svg isInteractive); on macOS an image sometimes does not animate.
let sandboxFrame = false

const STYLE =
  '<style>' +
  '@keyframes kp{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3);opacity:1}100%{transform:scale(1);opacity:1}}' +
  '@keyframes hover{0%,100%{transform:translateY(-1.6px)}50%{transform:translateY(1.6px)}}' +
  `@keyframes whiten{0%{opacity:0}80%{opacity:.85}100%{opacity:1}}` +
  '@keyframes vanish{0%,84%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.7)}}' +
  '@keyframes burst{0%,70%{opacity:0;transform:scale(.5)}86%{opacity:1;transform:scale(3)}100%{opacity:0;transform:scale(5)}}' +
  '.kp,.kl,.kz,.kr{transform-box:fill-box;transform-origin:center}' +
  '.kp{animation:kp .9s ease-out 1 both}' +
  '.kl{animation:hover 4s ease-in-out infinite}' +
  `.kz{animation:vanish ${BALLS_FINALE}s linear 1 forwards}` +
  `.kw{animation:whiten ${BALLS_FINALE}s linear 1 forwards;opacity:0}` +
  `.kr{opacity:0;animation:burst ${BALLS_FINALE}s linear 1 forwards}` +
  '@keyframes drift{0%,100%{transform:translate(0px,0px) rotate(0deg)}50%{transform:translate(1.4px,-1.8px) rotate(1deg)}}' +
  '@keyframes flyby{' +
  '0%,5%{transform:translate(0px,0px);animation-timing-function:cubic-bezier(.55,0,.85,.5)}' +
  '76%{transform:translate(150px,-5px)}' +
  '76.01%{transform:translate(-45px,7px);animation-timing-function:cubic-bezier(.2,.5,.4,1)}' +
  '100%{transform:translate(0px,0px)}}' +
  '@keyframes wave{0%,100%{transform:translateY(-2.5px) rotate(-6deg)}50%{transform:translateY(3px) rotate(6deg)}}' +
  '@keyframes kame{0%{transform:scale(.2);opacity:.95}100%{transform:scale(2.6);opacity:0}}' +
  '@keyframes ssp{0%,100%{transform:scale(.85);opacity:.7}50%{transform:scale(1.25);opacity:1}}' +
  '@keyframes ssb{0%,100%{opacity:.05}50%{opacity:.2}}' +
  '.ss{transform-box:fill-box;transform-origin:center;animation:ssp .9s ease-in-out infinite}' +
  '.ssb{animation:ssb 1.6s ease-in-out infinite}' +
  '@keyframes twinkle{0%,100%{opacity:.25}50%{opacity:1}}' +
  '@keyframes dragon{0%{transform:translateX(-110px)}100%{transform:translateX(250px)}}' +
  shenCss() +
  '.gk,.fl,.kf{transform-box:fill-box;transform-origin:center}' +
  '.idle .gk{animation:drift 6s ease-in-out infinite}' +
  '.work .fl{animation:flyby 10s linear infinite}' +
  '.work .gk{animation:wave 2.4s ease-in-out infinite}' +
  '.kf{animation:kame 1.8s ease-out forwards}' +
  '.st{fill:#FFF6D8;animation:twinkle 3.4s ease-in-out infinite}' +
  `.sh{animation:dragon ${SHEN_FLIGHT}s linear 1 forwards}` +
  `.sb{animation:sb ${SHEN_T}s linear infinite}.sg{animation:sg ${SHEN_T}s linear infinite}.sr{animation:sr ${SHEN_T}s linear infinite}` +
  `.fg{transform-box:fill-box;transform-origin:0% 36.5%;animation:fg ${SHEN_T}s linear infinite}` +
  RM_RULE +
  '</style>'

// shenronSec: seconds since all the balls were collected (null = Shenron is not shown).
type Art = 'sunset' | 'dusk' | 'night'
type SceneOpts = { phase: string; art: Art; shenronSec: number | null; isFlying: boolean; balls: string; nowMs: number; ssj: boolean }

// Decides which artwork to show: the user's choice or the time of day for 'auto'
// (sunset 6-19, dusk 19-22, night 22-6).
const artFor = (choice: string, hour: number): Art =>
  choice === 'sunset' || choice === 'dusk' || choice === 'night'
    ? choice
    : hour >= 22 || hour < 6
      ? 'night'
      : hour >= 19
        ? 'dusk'
        : 'sunset'

const ART_SVG: Record<Art, string> = {
  sunset: SUNSET_PATHS,
  dusk: DUSK_PATHS,
  night: NIGHT_PATHS,
}

const sceneFor = (o: SceneOpts): string => {
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
    '<radialGradient id="ki"><stop offset="0" stop-color="#FFF6C8"/><stop offset=".5" stop-color="#FFD25A" stop-opacity=".8"/><stop offset="1" stop-color="#FF9F1C" stop-opacity="0"/></radialGradient>' + BALL_DEFS + '</defs>'

  const night =
    o.art === 'dusk'
      ? '<rect x="0" y="0" width="180" height="90" fill="#12063A" opacity="0.14"/>' + STARS_DUSK
      : o.art === 'night'
        ? STARS_NIGHT
        : ''

  const ssjGlow = o.ssj ? '<rect class="ssb" x="0" y="0" width="180" height="90" fill="#FFD94F"/>' : ''
  const ssjAura = o.ssj ? '<circle class="ss" cx="34" cy="33" r="11" fill="url(#ssg)"/>' : ''
  const shenron = o.shenronSec !== null && o.shenronSec < SHEN_FLIGHT ? shenronFor(o.shenronSec) : ''
  const kame = o.phase === 'done' ? '<g class="kf"><circle cx="34" cy="33" r="7" fill="url(#ki)"/></g>' : ''

  return (
    // Night pins the view to the top so a wide window does not crop the sky.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1.8 1.5 172.4 81" preserveAspectRatio="${o.art === 'night' ? 'xMidYMin' : 'xMidYMid'} slice">` +
    defs +
    (motionAlways ? STYLE.replace(RM_RULE, '') : STYLE) +
    `<g filter="url(#b)">${ART_SVG[o.art]}</g>` +
    night +
    ssjGlow +
    shenron +
    `<g class="${mode}"><g class="fl" style="animation-delay:-${((o.nowMs / 1000) % 10).toFixed(2)}s"><g class="gk" style="animation-delay:-${((o.nowMs / 1000) % (mode === 'work' ? 2.4 : 6)).toFixed(2)}s">${ssjAura}<g transform="translate(29 28) scale(0.052)" filter="url(#g)">${o.ssj ? GOKU_SSJ : GOKU_PATHS}</g></g></g></g>` +
    kame +
    o.balls +
    '</svg>'
  )
}

// ---------------------------------------------------------------------------
// Helpers: task list state (Dragon Balls).
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


type Texts = {
  toast: Record<string, string>
  style: string
  cannotDraw: (reason: string) => string
  descAura: string
  descShenron: string
  descPower: string
  descBackdrop: string
  descLang: string
  descSound: string
  soundState: (globalOn: boolean, muted: string[], events: string) => string
  soundUsage: (events: string) => string
  soundSet: (what: string, enabled: boolean) => string
  shenronLeft: string
  shenronSummoned: string
  ssjTestOn: string
  ssjTestOff: string
  flash: string
  ssjUsage: string
  thresholdsUsage: string
  thresholdsSet: (p: number[]) => string
  ssjSet: (n: number) => string
  reset: (p: number[], ssj: number) => string
  status: (pct: string, p: number[], ssj: number) => string
  backdropCurrent: (cur: string, list: string) => string
  backdropUnknown: (arg: string, list: string) => string
  backdropText: Record<string, string>
  styleOn: string
  styleOff: string
  auraOn: string
  auraOff: string
  ssjToast: (n: number) => string
  langSet: (l: string) => string
  langUsage: string
  alt: string
  rising: string
  power: string
  over9000: string
  charging: string
  failed: string
  hit: string
}

const TXT: Record<Lang, Texts> = {
  pl: {
    toast: {
      end: 'Kamehameha! Tura zakończona.',
      level: 'Poziom mocy: {n}',
      compact: 'Kontekst skompresowany: moc spada.',
      ball: 'Smocza kula zebrana: {n}',
      shenron: 'Wszystkie smocze kule zebrane! Shenron się pojawia.',
    },
    style:
      'Dodatkowy styl (motyw Kinto Mode): odpowiadaj normalnie i rzeczowo, ale możesz od czasu do czasu ' +
      'dodać krótkie, lekkie nawiązanie do Dragon Ball (np. o „poziomie mocy” zadania). Nie wpływa to na treść techniczną.',
    cannotDraw: reason => `Goku: nie rysuje się: ${reason}`,
    descAura: 'Goku: /aura-kinto = lot ciągły, /aura-kinto style = lekki styl Dragon Ball w odpowiedziach',
    descShenron: 'Goku: /shenron-kinto = przywołaj Shenrona (test), /shenron-kinto stop = odeślij',
    descPower: 'Goku: /power-kinto = stan mocy i progi; thresholds <4 liczby>, ssj <n>, reset; ssj / flash = testy',
    descBackdrop: 'Goku: /backdrop-kinto auto|sunset|dusk|night = wybór tła',
    descLang: 'Goku: /lang-kinto pl|en = język tekstów',
    descSound: 'Goku: /sound-kinto on|off = dźwięki; <event> on|off = pojedyncze',
    soundState: (g, w, z) => `Dźwięki: ${g ? 'włączone' : 'wyłączone'}.${w.length > 0 ? ` Wyciszone: ${w.join(', ')}.` : ''} Zdarzenia: ${z}.`,
    soundUsage: z => `Użyj: /sound-kinto on|off albo /sound-kinto <event> on|off (${z}).`,
    soundSet: (c, w) => `Dźwięki (${c}): ${w ? 'włączone' : 'wyłączone'}.`,
    shenronLeft: 'Shenron odleciał.',
    shenronSummoned: 'Shenron przywołany. Przelot trwa ok. 45 sekund.',
    ssjTestOn: 'Super Saiyan (test) włączony.',
    ssjTestOff: 'Super Saiyan (test) wyłączony.',
    flash: 'Błysk paska mocy.',
    ssjUsage: 'Podaj próg 1–100, np. /power-kinto ssj 40.',
    thresholdsUsage: 'Podaj cztery rosnące progi 1–100, np. /power-kinto thresholds 20 40 60 80.',
    thresholdsSet: p => `Progi mocy: ${p.join(', ')}%.`,
    ssjSet: n => `Super Saiyan od ${n}%.`,
    reset: (p, ssj) => `Progi przywrócone do ustawień wtyczki: ${p.join(', ')}%, Super Saiyan od ${ssj}%.`,
    status: (pct, p, ssj) =>
      `Moc ${pct}. Progi: ${p.join(', ')}%. Super Saiyan od ${ssj}%.\n` +
      'Zmiana: /power-kinto thresholds 20 40 60 80, /power-kinto ssj 40, /power-kinto reset. ' +
      'Test: /power-kinto ssj (bez liczby) albo /power-kinto flash.',
    backdropCurrent: (cur, list) => `Tło: ${cur}. Wybierz: ${list}. Przykład: /backdrop-kinto dusk`,
    backdropUnknown: (arg, list) => `Nie znam tła „${arg}". Dostępne: ${list}.`,
    backdropText: {
      auto: 'Tło: auto (sunset 6-19, dusk 19-22, night 22-6).',
      sunset: 'Tło: zachód słońca.',
      dusk: 'Tło: zmierzch z gwiazdami.',
      night: 'Tło: gwiaździsta noc.',
    },
    styleOn: 'Styl Dragon Ball włączony.',
    styleOff: 'Styl Dragon Ball wyłączony.',
    auraOn: 'Aura włączona: Goku leci cały czas.',
    auraOff: 'Aura wyłączona: Goku leci tylko, gdy Claude pracuje.',
    ssjToast: n => `SUPER SAIYAN! Moc przekroczyła ${n}%.`,
    langSet: l => `Język: ${l}.`,
    langUsage: 'Podaj język: /lang-kinto pl albo /lang-kinto en.',
    alt: 'Góry o zachodzie, pomarańczowe niebo, Goku w locie',
    rising: 'MOC ROŚNIE',
    power: 'Moc',
    over9000: ' (ponad 9000!)',
    charging: '◌ ładowanie ki…',
    failed: '✕ atak nieudany',
    hit: '● cios trafił',
  },
  en: {
    toast: {
      end: 'Kamehameha! Turn finished.',
      level: 'Power level: {n}',
      compact: 'Context compacted: power drops.',
      ball: 'Dragon Ball collected: {n}',
      shenron: 'All Dragon Balls collected! Shenron appears.',
    },
    style:
      'Extra style (Kinto Mode theme): answer normally and factually, but you may occasionally ' +
      'add a short, light Dragon Ball reference (for example a task\'s "power level"). It does not affect the technical content.',
    cannotDraw: reason => `Goku: cannot draw: ${reason}`,
    descAura: 'Goku: /aura-kinto = continuous flight, /aura-kinto style = light Dragon Ball style in replies',
    descShenron: 'Goku: /shenron-kinto = summon Shenron (test), /shenron-kinto stop = send him away',
    descPower: 'Goku: /power-kinto = power level and thresholds; thresholds <4 numbers>, ssj <n>, reset; ssj / flash = tests',
    descBackdrop: 'Goku: /backdrop-kinto auto|sunset|dusk|night = choose the backdrop',
    descLang: 'Goku: /lang-kinto pl|en = language of the texts',
    descSound: 'Goku: /sound-kinto on|off = sounds; <event> on|off = single events',
    soundState: (g, w, z) => `Sounds: ${g ? 'on' : 'off'}.${w.length > 0 ? ` Muted: ${w.join(', ')}.` : ''} Events: ${z}.`,
    soundUsage: z => `Use: /sound-kinto on|off or /sound-kinto <event> on|off (${z}).`,
    soundSet: (c, w) => `Sounds (${c}): ${w ? 'on' : 'off'}.`,
    shenronLeft: 'Shenron flew away.',
    shenronSummoned: 'Shenron summoned. The flight takes about 45 seconds.',
    ssjTestOn: 'Super Saiyan (test) on.',
    ssjTestOff: 'Super Saiyan (test) off.',
    flash: 'Power bar flash.',
    ssjUsage: 'Give a threshold 1–100, e.g. /power-kinto ssj 40.',
    thresholdsUsage: 'Give four increasing thresholds 1–100, e.g. /power-kinto thresholds 20 40 60 80.',
    thresholdsSet: p => `Power thresholds: ${p.join(', ')}%.`,
    ssjSet: n => `Super Saiyan from ${n}%.`,
    reset: (p, ssj) => `Thresholds back to the plugin settings: ${p.join(', ')}%, Super Saiyan from ${ssj}%.`,
    status: (pct, p, ssj) =>
      `Power ${pct}. Thresholds: ${p.join(', ')}%. Super Saiyan from ${ssj}%.\n` +
      'Change: /power-kinto thresholds 20 40 60 80, /power-kinto ssj 40, /power-kinto reset. ' +
      'Test: /power-kinto ssj (no number) or /power-kinto flash.',
    backdropCurrent: (cur, list) => `Backdrop: ${cur}. Choose: ${list}. Example: /backdrop-kinto dusk`,
    backdropUnknown: (arg, list) => `Unknown backdrop "${arg}". Available: ${list}.`,
    backdropText: {
      auto: 'Backdrop: auto (sunset 6–19, dusk 19–22, night 22–6).',
      sunset: 'Backdrop: sunset.',
      dusk: 'Backdrop: dusk with stars.',
      night: 'Backdrop: starry night.',
    },
    styleOn: 'Dragon Ball style on.',
    styleOff: 'Dragon Ball style off.',
    auraOn: 'Aura on: Goku flies all the time.',
    auraOff: 'Aura off: Goku flies only while Claude works.',
    ssjToast: n => `SUPER SAIYAN! Power passed ${n}%.`,
    langSet: l => `Language: ${l}.`,
    langUsage: 'Give a language: /lang-kinto pl or /lang-kinto en.',
    alt: 'Mountains at sunset, orange sky, Goku in flight',
    rising: 'POWER RISING',
    power: 'Power',
    over9000: ' (over 9000!)',
    charging: '◌ charging ki…',
    failed: '✕ attack failed',
    hit: '● hit landed',
  },
}

const tx = async ($: Parameters<typeof read>[0]): Promise<Texts> => TXT[await getLang($)]

// Aliases: the Polish backdrop and subcommand names (the former names) work like the English ones.
const ALIAS: Record<string, string> = {
  zachod: 'sunset',
  zmierzch: 'dusk',
  noc: 'night',
  progi: 'thresholds',
  blysk: 'flash',
  styl: 'style',
  koniec: 'end',
  poziom: 'level',
  kompakt: 'compact',
  kula: 'ball',
}

const applyPlanState = async ($: EngineInterface, before: readonly string[], after: string[]): Promise<void> => {
  await update($, plan, () => after)

  // Balls around the chat: as many as there are completed tasks (proportionally, max 7).
  // Always 7 balls, spread evenly over the steps (e.g. 3 steps give 2, 2 and 3 balls; the last step gets the remainder).
  const N = after.length
  const visible = N > 0 ? Math.floor((after.filter(s => s === 'completed').length * 7) / N) : 0
  const nowMs0 = await $.clock.now()
  const previous = await read($, ballsAt)
  await update($, ballsAt, () => Array.from({ length: visible }, (_, i) => previous[i] ?? nowMs0))

  const was = before.filter(s => s === 'completed').length
  const now = after.filter(s => s === 'completed').length
  const isAll = after.length > 0 && now === after.length
  const wasAll = before.length > 0 && was === before.length

  if (now > was && !isAll) {
    await react($, 'ball', `${visible}/7`)
  }

  if (isAll && !wasAll) {
    const nowMs = await $.clock.now()
    await update($, shenronAt, () => nowMs)
    refreshAfterBalls($)
    await react($, 'shenron')
  } else if (!isAll) {
    await update($, shenronAt, () => 0)
  }
}

// ---------------------------------------------------------------------------
// Power from context usage.
// ---------------------------------------------------------------------------
// The compaction window (breakdown.rawMaxTokens) from the last full measurement. Lets a turn step
// turn the tokens of a response into a percentage without asking for the costly breakdown each time.
let compactWindow: number | undefined

// Context usage relative to the compaction window, the same figure the app shows; caches the window.
const measurePower = async ($: EngineInterface): Promise<number | undefined> => {
  try {
    const breakdown = (await $.session.usage({ breakdown: 'summary' })).context.breakdown

    if (breakdown) {
      compactWindow = breakdown.rawMaxTokens

      return breakdown.percentage
    }
  } catch {
    // no measurement available
  }

  return undefined
}

// Sets the power and everything that follows from it. `isQuiet`: a drop (compaction) is not
// announced, it only lowers the level without a sound or flash.
const applyPower = async ($: EngineInterface, raw: number, isQuiet = false): Promise<void> => {
  const pct = Math.round(raw)
  const prev = await read($, level)
  const prevPct = await read($, percent)
  const cfg = await getThresholds($)
  const lv = levelFrom(pct, cfg.p)
  await update($, percent, () => pct)

  if (!isQuiet && lv > prev) {
    await react($, 'level', power(pct))
    flashPower($)
  }

  if (!isQuiet && pct >= cfg.ssj && prevPct < cfg.ssj) {
    $.ui.toast((await tx($)).ssjToast(cfg.ssj))
  }

  if (lv !== prev) {
    await update($, level, () => lv)
  }
  $.ui.status(`${(await tx($)).power} ${power(pct)}`)
}

// After a compaction the engine's figures settle only gradually (the first reading may be the old
// fill, or only the summary without the system prompt and tools): measure again a few times and
// follow the measurement in both directions until two readings in a row agree.
const RECHECK_MS = 1500
const RECHECK_TRIES = 4
const recheckAfterCompact = ($: EngineInterface, last?: number, attempt = 1): void => {
  $.clock.after(RECHECK_MS, async () => {
    const p = await measurePower($)
    const isStable = p !== undefined && last !== undefined && Math.round(p) === Math.round(last)

    if (p !== undefined && Math.round(p) !== (await read($, percent))) {
      await applyPower($, p, true)
    }

    if (!isStable && attempt < RECHECK_TRIES) {
      recheckAfterCompact($, p ?? last, attempt + 1)
    }
  })
}

export const register: Register = (on, options) => {
  settings = {
    p1: clampPct(options.threshold1, DEFAULTS.p1),
    p2: clampPct(options.threshold2, DEFAULTS.p2),
    p3: clampPct(options.threshold3, DEFAULTS.p3),
    p4: clampPct(options.threshold4, DEFAULTS.p4),
    ssj: clampPct(options.ssjThreshold, DEFAULTS.ssj),
  }
  langOption = options.language === 'pl' ? 'pl' : 'en'
  motionAlways = options.motion === 'always'
  soundOption = options.sounds !== 'off'
  sandboxFrame = options.frame === 'sandbox'

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    const set = await $.theme.set(LOOK)

    if (!set.isDrawn) {
      $.ui.toast((await tx($)).cannotDraw(set.reason))
    }

    const t = await tx($)

    await $.command.register({
      name: 'aura-kinto',
      description: t.descAura,
    })

    await $.command.register({
      name: 'shenron-kinto',
      description: t.descShenron,
    })

    await $.command.register({
      name: 'power-kinto',
      description: t.descPower,
    })

    await $.command.register({
      name: 'backdrop-kinto',
      description: t.descBackdrop,
    })

    await $.command.register({
      name: 'lang-kinto',
      description: t.descLang,
    })

    await $.command.register({
      name: 'sound-kinto',
      description: t.descSound,
    })

    return next(e)
  })

  // Test and fun: summons Shenron without collecting balls. /shenron-kinto stop ends the flight.
  on('command.run', { command: 'shenron-kinto' }, async ($, e) => {
    const t = await tx($)

    if (e.args.trim() === 'stop') {
      await update($, shenronAt, () => 0)

      return { text: t.shenronLeft }
    }
    await update($, shenronAt, () => Date.now())
    refreshAfterBalls($)
    await react($, 'shenron')

    return { text: t.shenronSummoned }
  })

  on('command.run', { command: 'power-kinto' }, async ($, e) => {
    const t = await tx($)
    const arg0 = e.args.trim().toLowerCase()
    const [w0 = '', ...rest] = arg0.split(/\s+/)
    const arg = [ALIAS[w0] ?? w0, ...rest].join(' ').trim()
    const pct = await read($, percent)

    if (arg === 'ssj') {
      const now = !(await read($, ssjTest))
      await update($, ssjTest, () => now)

      return { text: now ? t.ssjTestOn : t.ssjTestOff }
    }

    if (arg === 'flash') {
      flashPower($)

      return { text: t.flash }
    }

    const cur = await getThresholds($)

    if (arg.startsWith('ssj ')) {
      const n = Number(arg.slice(4))

      if (!Number.isFinite(n) || n < 1 || n > 100) {
        return { text: t.ssjUsage }
      }
      await update($, ssjOverride, () => Math.round(n))

      return { text: t.ssjSet(Math.round(n)) }
    }

    if (arg.startsWith('thresholds ')) {
      const n = arg.slice(11).split(/[\s,]+/).filter(Boolean).map(Number)

      if (n.length !== 4 || n.some(x => !Number.isFinite(x) || x < 1 || x > 100) || n.some((x, i) => i > 0 && x <= n[i - 1])) {
        return { text: t.thresholdsUsage }
      }
      const updated = n.map(Math.round)
      await update($, thresholdsOverride, () => updated)

      return { text: t.thresholdsSet(updated) }
    }

    if (arg === 'reset') {
      await update($, thresholdsOverride, () => [])
      await update($, ssjOverride, () => 0)
      const d = await getThresholds($)

      return { text: t.reset(d.p, d.ssj) }
    }

    return { text: t.status(power(pct), cur.p, cur.ssj) }
  })

  on('command.run', { command: 'backdrop-kinto' }, async ($, e) => {
    const t = await tx($)
    const arg0 = e.args.trim().toLowerCase()
    const arg = ALIAS[arg0] ?? arg0
    const cur = await read($, backdropChoice)

    if (arg === '') {
      return { text: t.backdropCurrent(cur, BACKDROPS.join(', ')) }
    }

    if (!(BACKDROPS as readonly string[]).includes(arg)) {
      return { text: t.backdropUnknown(arg0, BACKDROPS.join(', ')) }
    }
    await update($, backdropChoice, () => arg as BackdropChoice)

    return { text: t.backdropText[arg] ?? '' }
  })

  on('command.run', { command: 'aura-kinto' }, async ($, e) => {
    const t = await tx($)
    const arg = e.args.trim().toLowerCase()

    if (arg === 'style') {
      const now = !(await read($, isStyled))
      await update($, isStyled, () => now)

      return { text: now ? t.styleOn : t.styleOff }
    }
    const now = !(await read($, isFlying))
    await update($, isFlying, () => now)

    return { text: now ? t.auraOn : t.auraOff }
  })

  on('command.run', { command: 'lang-kinto' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg !== 'pl' && arg !== 'en') {
      return { text: (await tx($)).langUsage }
    }
    await update($, langOverride, () => arg)

    return { text: TXT[arg].langSet(arg) }
  })

  on('command.run', { command: 'sound-kinto' }, async ($, e) => {
    const t = await tx($)
    const events = Object.keys(EVENTS).join(', ')
    const [w0 = '', w1 = ''] = e.args.trim().toLowerCase().split(/\s+/)
    const override = await read($, soundOverride)
    const globalOn = override === 'on' ? true : override === 'off' ? false : soundOption
    const muted = await read($, mutedOverride)

    if (w0 === '') {
      return { text: t.soundState(globalOn, muted, events) }
    }

    if (w0 === 'on' || w0 === 'off') {
      await update($, soundOverride, () => w0)

      if (w0 === 'on') {
        await update($, mutedOverride, () => [])
      }

      return { text: t.soundSet('all', w0 === 'on') }
    }
    const ev = ALIAS[w0] ?? w0

    if (!(ev in EVENTS) || (w1 !== 'on' && w1 !== 'off')) {
      return { text: t.soundUsage(events) }
    }
    const rest = muted.filter(x => x !== ev)
    await update($, mutedOverride, () => (w1 === 'off' ? [...rest, ev] : rest))

    if (w1 === 'on' && !globalOn) {
      await update($, soundOverride, () => 'on')
    }

    return { text: t.soundSet(ev, w1 === 'on') }
  })

  on('turn.start', async ($, e, next) => {
    await update($, phase, () => 'work')
    await react($, 'start')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await update($, phase, () => 'done')
    await react($, 'end')

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    // e.context.percent is relative to the whole model window (e.g. 1M), while the app shows
    // usage relative to the compaction window (e.g. 500k). We take the same as the app: the breakdown.
    const raw = (await measurePower($)) ?? e.context.percent

    if (raw !== undefined) {
      await applyPower($, raw)
    }

    return next(e)
  })

  // session.measure arrives only after a whole turn, so during a long task the power would stand
  // still. After each model response of the main thread we estimate it from the response's tokens.
  // Only upwards: the estimate and the breakdown differ slightly, and the end-of-turn measurement corrects it.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)

    if (e.agentId === undefined && result.usage) {
      if (compactWindow === undefined) {
        await measurePower($)
      }

      if (compactWindow) {
        const u = result.usage
        const tokens = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
        const pct = (tokens / compactWindow) * 100

        if (Math.round(pct) > (await read($, percent))) {
          await applyPower($, pct)
        }
      }
    }

    return result
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)

    // A precompute only prepares a summary for a later compaction: the conversation is unchanged.
    if (e.trigger === 'precompute') {
      return result
    }

    // The measurement (session.measure) only arrives on the next turn, so the bar
    // would keep the old value. After a successful compaction we recompute the power right away.
    if (result && 'messages' in result && result.messages) {
      const prev = await read($, percent)
      const p = await measurePower($)

      // Token counts of the result (tokensAfter) leave out the system prompt and tools, so they
      // understate the fill (3% instead of 16%): only the breakdown is trusted, never an estimate.
      if (p !== undefined && p < prev) {
        await applyPower($, p, true)
      }

      // The first reading can still be partial or stale: follow the measurement until it settles.
      recheckAfterCompact($, p)

      await react($, 'compact')
    }

    return result
  })

  on('tool.call', { tool: PLAN_TOOL }, async ($, e, next) => {
    const before = await read($, plan)
    await applyPlanState($, before, applyPlan(before, e as unknown as Record<string, unknown>))

    return next(e)
  })

  // The last step is usually closed only by wrap_up (it ticks the list off itself), not by update_plan,
  // so without this the last ball would never appear and the step would stay as "…".
  on('tool.call', { tool: 'mcp__ccd_turn__wrap_up' }, async ($, e, next) => {
    const before = await read($, plan)

    if (before.length > 0 && before.some(s => s !== 'completed')) {
      await applyPlanState($, before, before.map(() => 'completed'))
    }

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)

    if (!(await read($, isStyled))) {
      return out
    }

    return { ...out, sections: [...out.sections, { id: 'goku:style', text: (await tx($)).style, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)
    const nowMs = await $.clock.now()
    const hour = new Date(nowMs).getHours()
    const since = await read($, shenronAt)

    const elapsed = since > 0 ? Math.max(0, (nowMs - since) / 1000) : null
    const list = await read($, plan)
    const times = await read($, ballsAt)
    await read($, refresh)
    // The ball finale (whitening, flash, vanishing) lasts BALLS_FINALE seconds, then Shenron appears.
    const balls = ballsFor(nowMs, times, elapsed, 7)

    const source = sceneFor({
      phase: await read($, phase),
      art: artFor(await read($, backdropChoice), hour),
      shenronSec: elapsed === null || elapsed < BALLS_FINALE ? null : elapsed - BALLS_FINALE,
      isFlying: await read($, isFlying),
      balls,
      nowMs,
      ssj: (await read($, percent)) >= (await getThresholds($)).ssj || (await read($, ssjTest)),
    })

    return <Svg source={source} alt={(await tx($)).alt} isInteractive={sandboxFrame} />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const t = await tx($)
    const pct = await read($, percent)
    const filled = Math.max(0, Math.min(20, Math.round(pct / 5)))
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
    const step = await read($, powerFlash)
    const cfg = await getThresholds($)
    const ssj = pct >= cfg.ssj || (await read($, ssjTest))

    // After reaching a higher level the bar blinks for a few seconds and has a border with sparks,
    // so it is clear that the sound is about a power increase. Without motion (step 0) it returns to its normal look.
    if (step > 0) {
      const palette = ['#FFD94F', '#FFFFFF', '#FF9800', '#FFFFFF']
      const color = palette[step % palette.length]
      const sparks = step % 2 === 0 ? '⚡' : '✦'
      return (
        <Box>
          <Text color={color} bold backgroundColor={step % 2 === 0 ? '#C25A00' : '#8A3F00'}>
            {` ${sparks} ${t.rising} ${power(pct)} ${bar} ${sparks} `}
          </Text>
        </Box>
      )
    }

    if (ssj) {
      return (
        <Box>
          <Text color="#FFE04A" bold backgroundColor="#8A3F00">
            {` ⚡ SUPER SAIYAN ${power(pct)} ${bar} ⚡ `}
          </Text>
        </Box>
      )
    }

    return (
      <Box>
        <Text color="#F57C00">
          {t.power} {power(pct)}
          {pct >= cfg.p[3] ? t.over9000 : ''} {bar}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const t = await tx($)
    const row = await next(e)

    return (
      <Box flexDirection="column">
        {row}
        <Text color={e.isErrored ? '#C62828' : '#F57C00'} dimColor={!e.isRunning}>
          {e.isRunning ? t.charging : e.isErrored ? t.failed : t.hit}
        </Text>
      </Box>
    )
  })
}
