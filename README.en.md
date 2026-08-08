<img src="docs/images/logo.svg" align="right" width="116" alt="Chasing Light logo" />

# Chasing Light · Kuafu and the Sun

> A silhouette-art mythic runner: become Kuafu and chase a sun you can never catch

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE) [![365 Open Source Plan #025](https://img.shields.io/badge/365%20Open%20Source%20Plan-%23025-1f6feb)](https://github.com/rockbenben/365opensource)

**[▶ Play online](https://kuafu.newzone.top)**

[简体中文](README.md) · [繁體中文](docs/i18n/README.zh-Hant.md) · **English** · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md)

![Title](docs/images/screenshot-title.webp)

> In the north dwelt a god called Kuafu, who, past all measure, chased the sun.

Become Kuafu on a silhouette wasteland, chasing a sun you can never catch: gather sunlight to raise the multiplier, sip sweet springs to dash again, shatter drought-fiends and sunbirds, cross a whole screen in one step once the power gauge fills — and get as far as you can before the long night behind you swallows you.

Unlike a generic endless runner, the world walks the whole record: setting out at dawn, drinking the Yellow River and the Wei, dying of thirst on the road, the staff cast down that became the Peach Forest. Crossing the final chapter is not the end — the moonlit Peach Forest and the starfields of the Great Wilderness are seen only by those who run far enough.

## What it runs on

| Area | Support |
| --- | --- |
| **Devices** | Desktop (keyboard) · phone / tablet (on-screen touch buttons). Held upright, it prompts you to rotate to landscape for the full view |
| **Browsers** | Build target ES2022 — Chrome / Edge 94+, Safari 15.4+, Firefox 93+ |
| **Install** | None. Open the page and play — no download, no account, no sign-up |
| **Network** | The game runs entirely in your browser; it only goes online when you submit a score (see below) |
| **Saves** | Best score, language preference and your custom runner live in browser local storage, never uploaded |
| **Engine** | Self-built Canvas 2D, zero runtime dependencies, no game framework; the leaderboard runs on a Cloudflare Worker + D1 (optional) |

> The game itself runs entirely in your browser. It only goes online when you **choose to submit a score**, and what leaves your machine is the nickname you typed plus that run's result (score, distance, duration, which board) — no account, no cookies, no other identifiers. Don't submit and it never talks to the network. To host your own backend, see [DEVELOPMENT.md](DEVELOPMENT.md).

![Playing](docs/images/screenshot.webp)

## How it plays

**Core loop**: run forward → clear cracked earth, chasms and spikes → gather **sunlight** to raise your multiplier and store spirit, sip **sweet springs** to refresh your dash → dash to shatter drought-fiends and drive off sunbirds → at full spirit unleash **Kuafu's Stride** to cross a whole screen → get further before the **long night** catches you. Being caught ends the run.

**Scoring**: `glory = distance × multiplier`. Each mote of sunlight adds +0.1 to the multiplier (capped at ×3); kills and style earn bonuses on top. The further you run and the higher your multiplier, the greater your glory.

**Spirit and the ultimate — Kuafu's Stride**: sunlight and kills fill the spirit gauge; at full, press `K` to stride — rise into the air, then sweep across an entire screen, shattering everything in the way, with 3 seconds of invulnerability on landing. It is the key to escaping trouble and to pushing your score.

**Enemies**: `drought-fiends` (demons of drought) and `sunbirds` (the crows of the ten suns). Hit them while dashing or striding to destroy them for points; touch them bare-handed and you die.

**See how you died**: death no longer cuts away mid-frame. The world stops, the camera pushes in, and your runner goes down where they fell; drop into a chasm and the camera follows you down so you can see which pit took you. The cause surfaces first, then the picture sinks into the long night and the ending art and your score rise out of the black. Press any key to skip ahead.

**The long night closes in**: the night behind you keeps accelerating and will eventually outrun you. Once it draws near the screen darkens at the edges and a heartbeat sets in, quickening the closer it gets. When you hear it, stop grabbing for sunlight.

**The world follows the story**: water appears through the river and marsh stretches, heat haze shimmers in the sun's scorch, and the closing chapter reveals the peach grove as the sun sinks. Cross the final chapter and it still does not stop — **moonlit Peach Forest → starfields of the Great Wilderness → the return of first light**, seen only by those who travel far.

**Titles and sharing**: your glory earns a title — `Out of the Waste` → `Sun-chaser` → `Drinker of River and Wei` → `North to the Great Marsh` → `Kuafu's Resolve` → `Equal to the Sun`. On the results screen press `F` (on touch, tap the top half) to make a score card (ending art + glory + title + URL) you can share straight away.

**Make it yours**: both the title and results screens carry a "your own runner" button — six built-in silhouettes (`Jade Rabbit`, `Yinglong`, `Xingtian`, `Hou Yi`, `Flying Apsara`, `Cat`), or hit "＋" to run as your own picture. **Use a PNG or SVG with a transparent background** — the runner is drawn standing on the ground against a silhouette scene, so an opaque image shows up as a rectangular slab. SVGs work even with only a `viewBox` and no `width`/`height`. The image is scaled down and kept in your browser's local storage — it is **never uploaded**. Single-frame runners get their gait synthesised — the legs swing while the head stays put, plus airborne stretch and dash lean — so even a headshot runs convincingly without making you dizzy.

![Results and title](docs/images/screenshot-ending.webp)

## Modes

| Mode              | What it is                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Endless**       | Terrain is random every run, endlessly — compete on the "Hall of Sun-Chasers"                        |
| **Today's Trial** | One seed and one level worldwide each day; every retry is the same map. It has its own daily board  |

Press `G` on the title screen (on touch, tap the upper part of the screen) to switch modes; the Today's Trial banner shows the date (seeds are issued by UTC day). The results screen lists the top five — if you made it in, your own row is lit.

## Controls

Press any key or tap to start from the title screen. On touch devices a set of translucent buttons appears while playing (left hand back/forward, right hand leap/dash, plus stride when spirit is full).

| Action | Keyboard | Touch |
| --- | --- | --- |
| Run left / right | `←` `→` or `A` `D` | Lower-left back / forward |
| Leap (hold for height, coyote time and buffering) | `Space` / `↑` / `W` | Lower-right leap |
| Dash (8-way, refreshed on landing or at a spring) | `Shift` / `J` (with a direction key) | Lower-right dash |
| Kuafu's Stride (full spirit · a screen a step · invulnerable) | `K` | The stride button lights up at full spirit |

Everything else has a button in the game, nothing to memorise: help `H`, share `F`, switch mode `G`, switch language `T`, mute `M`, restart `R`.

> Hidden cheat — Kuafu Unspent: press down three times (`↓↓↓` or `S S S`) to toggle unlimited spirit.

## Languages

**简体中文 · 繁體中文 · English · 日本語 · 한국어**. The browser language is picked on first visit; once you choose one yourself from the language chip (or press `T`), that choice outranks everything — even a `/ja/` link someone shares with you.

## Run it / deploy it yourself

`npm install && npm run dev`, then open the address printed in your terminal (default <http://localhost:5173>). Local testing, building, deployment (including the leaderboard Worker), engine notes and the directory layout are all in **[DEVELOPMENT.md](DEVELOPMENT.md)**.

---

## License and sources

- **Code**: [MIT License](LICENSE).
- **Text**: the narration quotes the *Classic of Mountains and Seas*, *Liezi* and Tao Yuanming's *Reading the Classic of Mountains and Seas*, all public-domain classics. The interface uses the system's serif/regular-script font stacks (no font files are bundled).
- **Art**: the character, background, ending and title images under `public/assets/` were generated with AI (Google Gemini) and then post-processed. Copyright in AI-generated images is still legally uncertain and is subject to the terms of the generating service; if you intend to use them commercially or redistribute them, assess compliance yourself or substitute your own assets.
- **Preset runners**: the six `public/assets/sprites/preset-*.svg` are hand-written SVG paths, no AI involved, MIT-licensed along with the rest of this repo.

## About the 365 Open Source Plan

Project **#025** of the [365 Open Source Plan](https://github.com/rockbenben/365opensource) — one person + AI, 300+ open-source projects in a year.

[Submit your idea →](https://365.aishort.top/) · [Discord](https://discord.gg/PZTQfJ4GjX) · [Telegram](https://t.me/aishort_top)
