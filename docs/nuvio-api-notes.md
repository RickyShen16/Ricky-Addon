# Nuvio as the widget data source: research notes

Source: official Nuvio Server API docs, https://nuvio.tv/docs (v1.3, updated Aug 20, 2026) and https://nuvio.tv/docs/deep-links (Nov 22, 2026).
The docs say these endpoints are the *officially supported public API* for third-party clients.

## Basics
- Base: `https://api.nuvio.tv` (Supabase-compatible). REST `/rest/v1/`, Auth `/auth/v1/`.
- Public publishable key (published in the docs, safe for clients): `sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN`
- Every request: `apikey: <publishable key>`; authenticated ones also `Authorization: Bearer <access_token>`.
- Rate guideline: ≤100 req/s per user (widgets do ~2 per refresh).

## Auth
- Sign in: `POST /auth/v1/token?grant_type=password` `{email, password}` → `access_token` (expires_in 3600), `refresh_token`.
- Refresh: `POST /auth/v1/token?grant_type=refresh_token` `{refresh_token}` → new access + **new** refresh token (store the new one every time).
- Plan: one-time sign-in inside Scriptable on the phone (password never stored, never leaves the device except to Nuvio). Keep only the refresh token in Keychain, plus an iCloud copy so the Mac's Scriptable can use it.

## Profiles
- `POST /rest/v1/rpc/sync_pull_profiles` (no body) → `[{profile_index 1..6, name, avatar_color_hex, ...}]`.
- All data is scoped by `p_profile_id` = **profile_index** (integer), not the uuid.

## Data
- **Continue watching:** `POST /rest/v1/rpc/sync_pull_watch_progress` `{p_profile_id, p_limit}` → newest first:
  `content_id` (`tmdb:1396`), `content_type` (movie|series), `video_id` (`tmdb:1396:1:1`), `season`, `episode`,
  `position` / `duration` (ms), `last_watched` (epoch ms).
  So the widget can show **"Resume S1 E4 · 23:10 left"** with an exact progress bar.
- **History:** `POST /rest/v1/rpc/sync_pull_watched_items` `{p_profile_id, p_page, p_page_size}` → newest first:
  `content_id`, `content_type`, `title`, `season`, `episode`, `watched_at`.
  The server auto-adds a history item when progress ≥90%.
- IDs are TMDB-style (`tmdb:<id>`), which plugs straight into the TMDB logos/backdrops/stills the widgets already use.
  May also see IMDb `tt…` ids; resolve those with TMDB `/find`.

## Tap action
- `nuvio://tmdb/series/1396` or `nuvio://detail/movie/tt…` opens the title page in Nuvio. Links don't start playback.

## Gaps vs Simkl
- No "total episodes in season" field. Get that from TMDB `/tv/{id}/season/{n}` for the episode tick bar.
- No ratings/genres. Get those from TMDB details (one call, cached).
