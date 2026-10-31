# Handoff: Simkl + Manga widgets (iPhone and Mac)

Context for a new Claude Code session picking this up. Branch: `claude/simkl-radar-widget-cvmugs` in `RickyShen16/Ricky-Addon` (public repo).
The repo's original content (`server.js`, `package.json`, `vercel.json`) is an unrelated Stremio addon; leave it alone.

## Who and how they like to work

- The user (JD on the Mac, "Ricky" on GitHub) tracks TV/anime/movies on **Simkl** and manga via **WeebCentral** (read in **Tachimanga**, progress on **AniList**).
  Main manga: **Kagurabachi**, plus Sakamoto Days and JJK: Modulo.
- Wants to **see a visual preview before anything is built** when it's a design question ("show me first, don't do yet").
  For build requests, just build. Likes polished, "canggih" design; dislikes clutter ("too much → make it minimal").
- Wants **everything saved** to the repo, not just scripts: screenshots, previews, notes.
- Not a developer. Give exact copy-paste Terminal commands, one block, and say what they should see.
- Their aesthetic: dark, red accents (Itachi / Akatsuki wallpapers).

## What exists

### iPhone (Scriptable) — `scriptable/` (done, in use)
See `scriptable/README.md`. Home: `Simkl Radar.js` (medium), `Manga Small.js`. Lock screen: `Simkl Lock.js` (episode ticks + TMDB title logo),
`Manga Lock.js` (Kagurabachi, rectangle "big chapter number" + minimal circles), `Itachi Eyes.js`. Final result: `docs/final-lockscreen.png`.
TMDB key is deliberately blank in the repo (user has it on their phone).

### Mac — `mac/` (built, installed, working on JD's MacBook Pro)
See `mac/README.md`. Install/update with:
```
cd ~/Downloads && rm -rf Ricky-Addon-claude-simkl-radar-widget-cvmugs simkl.zip && curl -sL -o simkl.zip https://github.com/RickyShen16/Ricky-Addon/archive/refs/heads/claude/simkl-radar-widget-cvmugs.zip && unzip -q simkl.zip && bash Ricky-Addon-claude-simkl-radar-widget-cvmugs/mac/install.sh
```
- `mac/simkl/simkl.js` — JXA core (`osascript -l JavaScript`, no deps). Commands: `login`, `data`, `logout`, `position <spot>`.
  Token + cache + position live in `~/.simkl-radar/`. **Already linked on the Mac.**
- `mac/simkl/simkl-radar.widget/index.jsx` — **Übersicht** large desktop widget. **Confirmed rendering on the Mac** with real data (Loki, recent movies).
- `mac/simkl/simkl.10m.js` — **SwiftBar** menu bar plugin. **Confirmed working.**
- Notification Center: no code — macOS "Use iPhone widgets" (Desktop & Dock → Widgets) mirrors the iPhone Scriptable widget.
- Homebrew, Übersicht and SwiftBar are installed on the Mac.

## Open right now

1. **Moving the desktop widget.** Dragging the bottom bar did not work in Übersicht (no hover/drag reached the widget).
   Fix shipped in `b728588` but **not yet installed/verified on the Mac**: menu bar → *Move desktop widget* → preset spot,
   or `osascript -l JavaScript ~/.simkl-radar/simkl.js position top-right`. Run the install command above first, then refresh Übersicht.
   Verify: the card jumps to the chosen spot; also check whether **Resume / Open in Simkl** buttons respond to clicks
   (if not, Übersicht isn't passing mouse events at all).
2. **Fixes from `4103018` not yet installed on the Mac**: blurred-poster backdrop when a title has no Simkl fanart (Loki), card titles clear of the ✓.

## Next (user asked for this)

Build the **manga tracker for Mac**, same three places: Übersicht desktop widget, SwiftBar menu bar, Notification Center (iPhone mirroring).
Source: WeebCentral RSS (`https://weebcentral.com/series/<id>/rss`, ids in `scriptable/Manga Small.js`), Kagurabachi first.
Show design previews before building. AniList profile `MastaDeBlasta` is **private** → API returns "Private User", so unread counts
fall back to latest chapter + release date unless the user makes it public. Tachimanga has no widget/API hooks; it syncs progress to AniList.

## Gotchas learned the hard way

- **JXA:** `doShellScript` needs `app.includeStandardAdditions = true` or it fails with `-1708 Message not understood`.
- **Übersicht:** no `React` in scope → **no `<>` fragments**. Inject CSS with `<style dangerouslySetInnerHTML>` (plain `{CSS}` gets escaped).
  Widgets folder is only created on Übersicht's first launch (installer creates it). Hover/drag events didn't reach the widget.
- **SwiftBar:** plugin folder is unset until chosen (installer sets `com.ameba.SwiftBar PluginDirectory`).
- Simkl images: posters `https://simkl.in/posters/<p>_m.jpg`, fanart `https://simkl.in/fanart/<f>_medium.jpg`. Fanart often has the title logo at the top, so the hero crops at `center 78%`.
- iOS lock screen is single-tint; dark art disappears. TMDB logos are pushed to white via `wsrv.nl ... &bri=255`.
- Preview workflow used: esbuild + react-dom/server to render the real `index.jsx`, Playwright Chromium to screenshot with real Simkl art routed locally.
- This branch's previous session ran in the cloud and could not reach the Mac; a session running **on the Mac** can just run the commands.
