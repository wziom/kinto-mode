# Kinto Mode

A Dragon Ball–themed mod for Claude: orange palette (light by day, dark by night), a painted mountain backdrop and Goku riding the Flying Nimbus in the distance. It is more than a skin: the mod tracks your session's **power level**, collects **Dragon Balls** from your task list, and summons **Shenron** when you collect all seven.

> Power level of this package: over 9000. Install time: a few seconds.

![Sunset scene with Goku on the Flying Nimbus](docs/scene-sunset.svg)

*Preview of the backdrop layers (static render of the mod's own scene; in the app Goku and the extras are animated).*

## What you get

| Feature | How it works |
| --- | --- |
| **Colour theme** | Orange, cream and brown palette in light and dark mode. Accent `#F57C00`, with blue `#1F4E9E` as a secondary colour. |
| **Mountain backdrop** | Orange sky and mountains from an image generated in ComfyUI, embedded as SVG. Panels are blurred over it so text stays readable. |
| **Flying Goku** | Idle: he hovers in the distance. While Claude works he takes off, crosses the scene, returns from the left and brakes at home. |
| **Kamehameha** | When a turn finishes, Goku fires a one-off flash. |
| **Power level** | A bar above the prompt shows the session's context usage as a percentage, the same as the app's context panel (relative to the compaction window). At 25, 50, 75 and 90% there is a sound and a toast, and the bar flashes. Above 90% it adds "over 9000!". The value is also in the status line. |
| **Super Saiyan** | From 50% context usage the bar turns gold ("SUPER SAIYAN"), a golden aura pulses around Goku and the whole backdrop glows. A toast announces it. |
| **Dragon Balls** | Each completed step of the task list summons a yellow-orange ball with red stars (1–7) that hovers around the chat, alternating left and right. There are always seven, spread evenly across the steps (3 steps give 2, 2 and 3 balls). When the list is complete the balls turn white, flash and vanish, and Shenron appears. |
| **Shenron** | After all tasks are done a green dragon flies once across the sky (about 45 seconds). It is untangled into a sine wave: the body is a smooth ribbon animated frame by frame in CSS, with the head (vectorised from a ComfyUI image) nodding along. It then disappears until you collect the balls again. |
| **Three backdrops** | Sunset (6–19 h), dusk with a purple sky (19–22 h) and a starry night (22–6 h). `auto` picks by time of day; force one with `/backdrop-kinto`. |
| **Stars** | At dusk and night, small stars twinkle in the clear sky, each at its own rhythm. |
| **Tool call captions** | Under a tool call: "charging ki…" while running, "hit landed" on success, "attack failed" on error. |
| **Sounds and toasts per event** | Configurable in a single table (see below), in English or Polish. |

### Backdrops

| Sunset | Dusk | Night |
| --- | --- | --- |
| ![Sunset](docs/scene-sunset.svg) | ![Dusk](docs/scene-dusk.svg) | ![Night](docs/scene-night.svg) |

> In-app texts (toasts, captions, the power bar, command replies) come in English and Polish: see [Language](#language). Command arguments are English (`sunset`, `dusk`, `night`, `thresholds`, `style`, `flash`); the former Polish names (`zachod`, `zmierzch`, `noc`, `progi`, `styl`, `blysk`) still work as aliases.

## Installation

The mod is a one-plugin marketplace. In a Claude Code session:

```
/plugin install goku --marketplace wziom/kinto-mode
```

Confirm adding the marketplace (`y`) and choose the install scope. The full name is `goku@kinto-mode`: the plugin is called `goku`, the marketplace `kinto-mode`.

### Trying it from a local folder

Clone the repository, then:

```bash
claude plugin marketplace add <path-to-clone>
claude plugin install goku@kinto-mode
```

After editing files, reload the mod in a session with `/reload-plugins`.

Developer mode, no installation (one session only):

```bash
claude --plugin-dir <path-to-clone>
```

### Phone

The mod runs on the computer and the mobile app draws the theme it sends. Open a session hosted by a computer with the mod installed (for example through Remote Control). On a narrow screen the backdrop is cropped to the centre, so Goku may fall out of frame. Not tested on a real phone.

## Commands

Commands end in `-kinto` so they do not clash with other plugins' commands.

| Command | Effect |
| --- | --- |
| `/aura-kinto` | Toggles continuous flight: Goku flies all the time, not only while Claude works. |
| `/aura-kinto style` | Toggles a light Dragon Ball style in replies. Answers stay factual, with an occasional short reference such as a task's "power level". Off by default. |
| `/backdrop-kinto` | Shows the current backdrop. `/backdrop-kinto sunset`, `dusk` or `night` forces one, `/backdrop-kinto auto` returns to time-of-day selection. The current session remembers the choice. |
| `/power-kinto` | Shows the power level and the current thresholds. |
| `/power-kinto thresholds 20 40 60 80` | Sets the four power-level thresholds (increasing, 1–100) for the current session. |
| `/power-kinto ssj 40` | Sets the context usage at which Super Saiyan starts, for the current session. |
| `/power-kinto reset` | Returns the thresholds to the plugin settings. |
| `/power-kinto ssj`, `/power-kinto flash` | Tests: toggles a Super Saiyan preview, triggers the power-up bar flash, so you can see them without waiting. |

### Power thresholds

The defaults are 25, 50, 75 and 90% for the four power levels and 50% for Super Saiyan. To change them permanently, edit the plugin's options (`threshold1`–`threshold4` and `ssjThreshold`, shown when you install the plugin and in its settings). The commands above override them until the session ends.
| `/lang-kinto pl` / `en` | Switches the language of in-app texts for the current session. |
| `/sound-kinto on` / `off` | Turns all event sounds on or off for the current session (toasts stay). |
| `/sound-kinto <event> on` / `off` | Mutes or unmutes one event: `start`, `end`, `level`, `compact`, `ball`, `shenron`. Without arguments it shows the state. |
| `/goku:kinto-help` | A skill: lists everything the plugin can do (features, commands, settings, limitations). |
| `/shenron-kinto` | Summons Shenron without collecting balls (for testing). `/shenron-kinto stop` sends him away. |

## Event configuration

Sounds are set in the `EVENTS` table at the top of [`hooks/register.tsx`](hooks/register.tsx); notification texts live in the `TXT` table below it, one set per language:

```ts
const EVENTS: Record<string, Reaction> = {
  start:   { sound: 'sounds/start.wav' },
  end:     { sound: 'sounds/end.wav' },
  level:   { sound: 'sounds/level.wav' },
  compact: { sound: 'sounds/compact.wav' },
  ball:    { sound: 'sounds/ball.wav' },
  shenron: { sound: 'sounds/shenron.wav' },
}
```

- `sound`: path to a file in `sounds/`. An empty string or a missing key means silence.
- `TXT.<lang>.toast.<event>`: notification text. `{n}` is replaced by the power level or the number of collected balls. An empty string means no toast.
- Events: `start` (turn begins), `end` (turn ends), `level` (new power threshold), `compact` (context compaction), `ball` (task step completed), `shenron` (whole list completed).

## Sounds

Sounds are on by default. Set the `sounds` option (`on` or `off`) in the plugin settings for a permanent choice, or use `/sound-kinto` to switch all sounds or a single event for the current session.

## Language

In-app texts are available in English (default) and Polish. Set the `language` option in the plugin settings for a permanent choice, or run `/lang-kinto pl` or `/lang-kinto en` to switch for the current session.

## Animations

All motion is CSS and respects the system "Reduce motion" accessibility setting: when it is on (common on macOS), every animation freezes. Either turn that setting off, or set the plugin option `motion` to `always` to animate regardless. If animations still stand still (reported on macOS desktop), set `frame` to `sandbox`: the backdrop is then drawn in a sandboxed frame instead of as an image.

All sounds were generated locally in ComfyUI (effects: Stable Audio Open, Shenron theme: ACE-Step 1.5) and lightly processed (filter, saturation, short reverb). They use nobody's recordings. Stable Audio Open has its own licence (Stability AI Community License): commercial use requires registration with Stability AI above the revenue thresholds it sets.

## How Goku flies

1. Claude is not working: Goku hangs in the distance and floats lazily.
2. Claude is working (turn start to turn end): Goku takes off, speeds right, exits the edge, returns from the left and brakes.
3. End of turn: a one-off Kamehameha flash.
4. `/aura-kinto`: continuous flight.
5. All Dragon Balls collected: Shenron flows through the background.
6. System-level reduced motion: everything stands still.

Goku does not follow the cursor. The scene runs no scripts, so all motion is pure CSS.

## Known limitations

- **Sound:** the engine plays clips with `afplay`, so it works on macOS. On Windows the mod plays the WAV files through PowerShell (`System.Media.SoundPlayer`) instead. On Linux sounds may not play. Toasts always work.
- **One scene at a time:** a theme accepts one scene, so the mod swaps it when the time of day changes or after `/backdrop-kinto`. It refreshes at the next backdrop repaint.
- **Scene size limit:** the backdrop SVG may be 131,072 characters. The mosaic (176×84 cells), Goku and extras take about 125k on each of the three scenes, so there is little headroom.
- **Dragon Balls:** counted from calls to the task-list tool (`mcp__ccd_turn__update_plan`) in the desktop app. In other clients the list may look different and the balls will not light up.
- **Backdrop resolution:** it is a mosaic with light blur, so it looks painterly, not photographic.

## Structure

```
.claude-plugin/plugin.json        plugin manifest
.claude-plugin/marketplace.json   one-plugin marketplace
hooks/register.tsx                all the logic: colours, scene, events, bar
hooks/make-colors.js              theme generator (from the plugin tools)
hooks/backdrop-sunset-svg.ts                  day backdrop (sunset) as an SVG mosaic
hooks/backdrop-dusk-svg.ts              dusk backdrop as an SVG mosaic
hooks/backdrop-night-svg.ts          starry night backdrop as an SVG mosaic
hooks/goku-svg.ts                 Goku on the Flying Nimbus as a vector outline
hooks/ssj-hair-svg.ts            Super Saiyan hair (ComfyUI image, vectorised)
hooks/shenron-svg.ts              Shenron's head as a vector outline (the body is drawn by register.tsx)
skills/kinto-help/SKILL.md          skill that lists everything the plugin can do
sounds/                           short event sounds
docs/                             preview images used in this README
types/index.d.ts                  plugin state contract
```

## Development

Validate the plugin:

```bash
claude plugin validate .
```

`hooks/backdrop-sunset-svg.ts` and `hooks/goku-svg.ts` are generated from images. If you replace the artwork, keep the total scene size under the limit from the limitations section.

## Licence

MIT. Dragon Ball belongs to its creators. This is a fan theme with no official artwork or sounds.
