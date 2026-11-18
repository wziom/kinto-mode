---
name: kinto-help
description: Lists everything the goku (Kinto Mode) plugin can do - features, slash commands, settings, sounds, languages and known limitations. Use when the user asks what this plugin offers, how to use it, how to change thresholds, language, backdrop or animations, or says "kinto help".
---

# Kinto Mode (goku) - what you can do

Answer in the user's language. Present the sections below as a compact, scannable overview (headings and short tables or lists). Do not run anything; this skill only explains. Offer to run a command if the user wants to try one.

## What the plugin does

- **Theme:** orange, cream and brown palette, light and dark.
- **Backdrop:** painted mountains with Goku on the Flying Nimbus. Three scenes: sunset (6-19 h), dusk (19-22 h), starry night (22-6 h); `auto` picks by time.
- **Flying Goku:** hovers while idle, flies across the scene while Claude works, fires a Kamehameha flash when a turn ends.
- **Power level bar** above the prompt: context usage in percent. At four thresholds (default 25, 50, 75, 90%) there is a sound, a toast and a bar flash. Past the fourth threshold it adds "over 9000!".
- **Super Saiyan:** from 50% (configurable) the bar turns gold, Goku gets golden spiky hair and an aura, the backdrop glows, and a toast announces it.
- **Dragon Balls:** each completed step of the task list summons a ball (always seven in total). When the list is complete the balls vanish and **Shenron** flies across the sky for about 45 seconds.
- **Stars** twinkle at dusk and night.
- **Tool call captions:** "charging ki..." while a tool runs, "hit landed" on success, "attack failed" on error.
- **Sounds and toasts** for events: start, end of turn, power level, context compaction, Dragon Ball collected, Shenron.

## Commands

| Command | Effect |
| --- | --- |
| `/aura-kinto` | Toggles continuous flight (Goku flies all the time). |
| `/aura-kinto styl` | Toggles a light Dragon Ball style in Claude's replies (off by default). |
| `/tlo-kinto` | Shows the current backdrop. Arguments: `zachod` (sunset), `zmierzch` (dusk), `noc` (night), `auto`. English aliases work too. |
| `/moc-kinto` | Shows power level and thresholds. |
| `/moc-kinto progi 20 40 60 80` | Sets the four power thresholds (increasing, 1-100) for this session. |
| `/moc-kinto ssj 40` | Sets where Super Saiyan starts, for this session. |
| `/moc-kinto reset` | Returns thresholds to the plugin settings. |
| `/moc-kinto ssj` | Toggles a Super Saiyan preview (test). |
| `/moc-kinto blysk` | Triggers the power bar flash (test). |
| `/shenron-kinto` | Summons Shenron without collecting balls (test); `/shenron-kinto stop` sends him away. |
| `/lang-kinto pl` or `en` | Switches the language of in-app texts for this session. |
| `/goku:kinto-help` | This overview. |

## Plugin settings (permanent)

| Setting | Meaning | Default |
| --- | --- | --- |
| `language` | `en` or `pl`: language of toasts, captions, the bar and command replies. | `en` |
| `prog1`-`prog4` | The four power level thresholds (%). | 25, 50, 75, 90 |
| `progSsj` | Context usage (%) at which Super Saiyan starts. | 50 |
| `frame` | `image` (default) or `sandbox`: how the backdrop is drawn. Try `sandbox` if animations stand still (reported on macOS desktop). | `image` |
| `motion` | `system` respects the OS "Reduce motion" setting (animations freeze when it is on); `always` animates regardless. | `system` |

Session commands override these until the session ends.

## Good to know

- **Animations frozen (for example on a Mac):** usually the system "Reduce motion" setting. Set the plugin option `motion` to `always`, try `frame` = `sandbox`, or turn Reduce motion off in System Settings > Accessibility > Display.
- **Sound:** plays through the system player available on macOS; on Windows and Linux it may stay silent. Toasts always work.
- **Dragon Balls** are counted from the desktop app's task list; other clients may not light them up.
- The backdrop SVG is near the engine's size limit, so the scene is a painterly mosaic, not a photograph.
- Command arguments are Polish (`zachod`, `zmierzch`, `noc`, `progi`, `styl`, `blysk`) with English aliases (`sunset`, `dusk`, `night`, `thresholds`, `style`, `flash`).
- Sounds are generated locally in ComfyUI. Dragon Ball belongs to its creators; this is a fan theme.
