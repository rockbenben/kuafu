<img src="../images/logo.svg" align="right" width="116" alt="Chasing Light logo" />

# Chasing Light · Kuafu and the Sun

> A silhouette-art mythic runner: become Kuafu and chase a sun you can never catch

[简体中文](../../README.md) · [繁體中文](README.zh-Hant.md) · **English** · [日本語](README.ja.md) · [한국어](README.ko.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](../../LICENSE) [![365 Open Source Plan #025](https://img.shields.io/badge/365%20Open%20Source%20Plan-%23025-1f6feb)](https://github.com/rockbenben/365opensource)

> In the north dwelt a god called Kuafu, who, past all measure, chased the sun.

Become Kuafu on a silhouette wasteland and run headlong after a sun you will never reach — gather sunlight to press on, sip sweet springs to dash again, shatter drought-fiends and sunbirds, unleash Kuafu's Stride to cross a whole screen in one step, and get as far as you can before the long night behind you swallows you whole. The world shifts with the telling: from setting out at dawn, into the sun's scorch, drinking the Yellow River and the Wei, north to the Great Marsh, dying of thirst on the road, to the staff cast down that became the Peach Forest. Cross the final chapter and it still does not stop — deeper records unfold a moonlit Peach Forest, the starfields of the Great Wilderness, and the return of first light (the chase never ends).

![Title](../images/screenshot-title.webp)

**▶ Play online**: <https://kuafu.newzone.top>　·　**Run locally**: `npm install && npm run dev`, then open the address printed in your terminal (default <http://localhost:5173>).

A self-built Canvas 2D engine with zero runtime dependencies — no game framework, no art-runtime library. The optional global leaderboard runs on a Cloudflare Worker + D1.

> The game itself runs entirely in your browser. It only goes online when you **choose to submit a score**, and what leaves your machine is the nickname you typed plus that run's result (score, distance, duration, which board) — no account, no cookies, no other identifiers. Don't submit and it never talks to the network. To host your own backend, see [DEVELOPMENT.md](../../DEVELOPMENT.md).

![Playing](../images/screenshot.webp)

## How it plays

**Core loop**: run forward → clear cracked earth, chasms and spikes → gather **sunlight** to raise your multiplier and store spirit, sip **sweet springs** to refresh your dash → dash to shatter drought-fiends and drive off sunbirds → at full spirit unleash **Kuafu's Stride** to cross a whole screen → get further before the **long night** catches you.

**Scoring**: `glory = distance × multiplier`. Each mote of sunlight adds +0.1 to the multiplier (capped at ×3); kills and style earn bonuses on top. The further you run and the higher your multiplier, the greater your glory.

**Spirit and the ultimate — Kuafu's Stride**: sunlight and kills fill the spirit gauge; at full, press `K` to stride — rise into the air, then sweep across an entire screen, shattering everything in the way, with 3 seconds of invulnerability on landing. It is the key to escaping trouble and to pushing your score.

**Enemies**: `drought-fiends` (demons of drought) and `sunbirds` (the crows of the ten suns). Hit them while dashing or striding to destroy them for points; touch them bare-handed and you die.

**The world follows the story**: sky and land advance in one direction with your distance and the narration — water appears through the river and marsh stretches, heat haze shimmers in the sun's scorch, and the closing chapter reveals the peach grove as the sun sinks, until the staff becomes the Peach Forest. **Cross the final chapter and it still does not stop**: following deeper accounts of Kuafu in the *Classic of the Great Wilderness*, *Liezi*, and Tao Yuanming's *Reading the Classic of Mountains and Seas*, the world continues into a **moonlit Peach Forest → the starfields of the Great Wilderness → the return of first light** (the chase never ends), seen only by those who travel far — closing on Tao Qian's "his trace lies in the Peach Forest; the deed outlived him", which is exactly what "glory" means here.

## Glossary

The game dresses itself in the Kuafu myth, but the terms map plainly:

| Term                         | What it is in game                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| **Sunlight**                 | The motes you collect — raise the multiplier, store spirit, add points                |
| **Sweet spring**             | Pick it up to refresh one dash                                                        |
| **Spirit**                   | The ultimate gauge; full means you can unleash Kuafu's Stride                         |
| **Kuafu's Stride**           | The ultimate: rise, then sweep a whole screen, shattering all, invulnerable 3s on landing |
| **Glory**                    | Your score: `glory = distance × multiplier + bonuses`                                 |
| **Drought-fiend / Sunbird**  | The two enemies — kill by dashing or striding into them; bare contact is fatal        |
| **Long night**               | The wall of death closing in behind you; being caught ends the run                    |
| **Peach Forest / Great Wilderness** | The final chapter and what lies beyond (peach grove / starlit waste)            |

## Modes

| Mode              | What it is                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Endless**       | Terrain is random every run, endlessly — compete on the "Hall of Sun-Chasers"                        |
| **Today's Trial** | One seed and one level worldwide each day; every retry is the same map. It has its own daily board  |

Press `G` on the title screen, or tap the upper part of the screen, to switch modes; the Today's Trial banner shows the date (seeds are issued by UTC day).

## Titles

A title is granted by the glory of the run, inscribed in gold on the results screen and carried along on the share card:

`Out of the Waste` → `Sun-Chaser` → `Drinker of Rivers` → `North to the Great Marsh` → `Kuafu's Resolve` → `Equal to the Sun`

![Results and title](../images/screenshot-ending.webp)

## Controls

While playing, touch devices show a set of translucent buttons (left hand back/forward, right hand leap/dash, plus stride when spirit is full).

| Action                                          | Keyboard                              | Touch                                       |
| ----------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| Run left / right                                | `←` `→` or `A` `D`                    | Lower-left back / forward buttons           |
| Leap (hold for height, coyote time and buffering) | `Space` / `↑` / `W`                 | Lower-right leap button                     |
| Dash (8-way, refreshed on landing or at a spring) | `Shift` / `J` (with a direction key) | Lower-right dash button                     |
| Kuafu's Stride (full spirit · a screen a step · invulnerable) | `K`                      | The stride button lights up at full spirit  |
| Help overlay (pauses)                           | `H`                                   | The "? Help" chip, lower-left of the title screen |
| Share your score (results screen)               | `F`                                   | Tap the upper half of the results screen    |
| Switch mode (Endless / Today's Trial)           | `G`                                   | Tap the upper part of the title screen      |
| Switch language (five)                          | `T` opens the menu, `1`–`5` to pick   | The language chip, lower-right of the title and results screens |
| Mute                                            | `M`                                   | The sound button inside the help overlay    |
| Restart after death                             | `R` / `Space`                         | Tap the lower half of the results screen    |

Press any key or tap to start from the title screen. Holding a phone upright prompts you to rotate to landscape for the full view.

The title screen carries a chip in each lower corner (left "? Help", right "globe + current language"); **both mouse and touch can click them**, and on keyboard devices the chip also shows its `H` / `T` key. The results screen has a language chip in its lower-right corner too.

## Languages

Five languages are supported: **简体中文 · 繁體中文 · English · 日本語 · 한국어**. A language chip (globe icon + current language) sits in the lower-right of the title and results screens; click it to open the menu. On desktop you can also press `T`, then `1`–`5` to pick directly.

On your first visit the language is chosen from your browser settings, with a one-time note that you can change it. **Once you have picked a language yourself in the menu, that choice outranks everything else** — a `/ja/` link someone shares with you, or an address carrying `?lang=`, will not override it. Only before you have picked does the language in a link take effect.

The site prerenders a separate page per language (`/`, `/en/`, `/ja/`, `/ko/`, `/zh-Hant/`), each with localized title, description and share card, cross-referencing one another via `hreflang`.

The classical narration from the *Classic of Mountains and Seas* is rendered in other languages as sense-for-sense translation with the source named on a second line — the aim is to keep its antiquity rather than to translate word for word.

> Hidden cheat — Kuafu Unquenchable: press "down" three times in a row (`↓↓↓` or `S S S`) to toggle unlimited spirit.

## One-tap sharing

On the results screen, `F` or a tap on the upper half generates a score card (ending art + glory + title + tagline + URL): mobile goes through the native share sheet (with the image where possible), desktop copies the share text and downloads the card.

## Run it / deploy it yourself

Local development, testing, building, deployment (including the leaderboard Worker), engine notes and the directory layout are all in **[DEVELOPMENT.md](../../DEVELOPMENT.md)**.

---

## License and sources

- **Code**: [MIT License](../../LICENSE).
- **Text**: the narration quotes the *Classic of Mountains and Seas*, *Liezi* and Tao Yuanming's *Reading the Classic of Mountains and Seas*, all public-domain classics. The interface uses the system's serif/regular-script font stacks (no font files are bundled).
- **Art**: the character, background, ending and title images under `public/assets/` were generated with AI (Google Gemini) and then post-processed. Copyright in AI-generated images is still legally uncertain and is subject to the terms of the generating service; if you intend to use them commercially or redistribute them, assess compliance yourself or substitute your own assets.

## About the 365 Open Source Plan

Project **#025** of the [365 Open Source Plan](https://github.com/rockbenben/365opensource) — one person + AI, 300+ open-source projects in a year. [Submit a request →](https://365.aishort.top/) · [Discord](https://discord.gg/PZTQfJ4GjX) · [Telegram](https://t.me/aishort_top)
