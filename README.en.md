[한국어](README.md) | **English**

# AI GM Solo Dungeon World

A single-player Dungeon World (PbtA) web tool where an AI plays the GM. The player writes what
they do in plain text, the AI GM describes and drives the scene, and **the dice rolls and all
numeric state are handled by code (a rules engine)**.

Attached to it are **Character Chat**, a free-form mode with no rules, and a **Gallery** for
sharing the worlds you build. Character Chat runs as its own app with the gallery as its home and
a bottom tab bar (accounts and API keys are shared with Dungeon World).

For the original design background see [BRIEF.md](BRIEF.md) (written at the stage-1 MVP, so it is
narrower than the current scope).

## Two modes

| Mode | What it is |
|------|------|
| **🎲 GM mode** | Solo TRPG run on Dungeon World rules. 8 classes, 2d6 rolls, HP, inventory, XP and level-ups |
| **💬 Character Chat** | Roleplay with no rules and no dice — you define only a world and its characters. Put several characters in one world and the narrator plays all of them. Four tabs: Browse (gallery), My Chats, Create, Profile |

## Core design — separation of roles

| Owner | Responsibility |
|------|------|
| **Rules engine (code)** | 2d6 dice (server-side randomness), result bands (10+ / 7-9 / 6-), single source of truth for HP, inventory and other state |
| **AI GM (LLM)** | Scene description and NPC performance, interpreting free text into a move, narrating the result of a roll |

The core loop: **AI decides the move → code rolls 2d6 → the result is fed back to the AI to be
narrated** (two passes).
AI responses are forced through a JSON schema and arrive split into `narration` + `action`; the
rules engine validates `action` before any of it touches state. Numbers the LLM invents inside its
prose never become state.

## Running it

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env` (see `.env.example`). **You do not need an AI key in the server's .env** —
   the provider, model and API key are registered per user inside the app (⚙ Settings). `.env`
   holds only server settings such as the port and secrets.
3. Start the server:
   ```bash
   npm start
   ```
   During development, restart automatically on file changes:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000 → sign up (you are handed off to the single sign-on service) →
   register your own API key under ⚙ Settings → create a character and start the adventure.

> **When verifying UI changes** — the storage path is fixed to `<repo>/data` (`chatStore.js`,
> `auth.js`, `metrics.js`, `store.js`) and cannot be redirected with an environment variable. To
> avoid touching production data, copy `server public package.json` into a temporary directory,
> symlink `node_modules`, put an empty `data/` next to it and run it separately with `PORT=3999`.

## AI providers

Provider and model are chosen **per user**, and can differ per game or chat (🧠 button). The rules
engine, the UI and storage behave identically regardless of provider.

| Provider | Where to get a key | Notes |
|--------|---------|------|
| Google Gemini | aistudio.google.com/apikey | Free tier available without a card (the default) |
| Anthropic Claude | console.anthropic.com/settings/keys | Paid (prepaid credits) |
| OpenAI | platform.openai.com/api-keys | Paid |
| DeepSeek | platform.deepseek.com/api_keys | Paid (cheap) |
| xAI Grok | console.x.ai | Paid |
| Qwen | bailian.console.alibabacloud.com | Paid (free credits for new accounts) |
| Custom | — | Any OpenAI-compatible `/chat/completions` endpoint (Ollama, LM Studio, …). It must be a public address this server can reach |

> **A note on Gemini's free tier** — on the free tier, what you send and receive is used to improve
> Google's products and may be reviewed by humans. Best not to put sensitive information in. (The
> paid tier, with a payment method attached, is not used for training.)

**The free trial — the mode where the server pays for the key — is currently closed.** Setting
`LOCAL_LLM_URL` to an OpenAI-compatible endpoint reopens it, and `FREE_TRIAL=off` closes it again
temporarily while keeping the configuration. While open it allows one concurrent user plus a
per-user hourly call limit.

## Features

**GM mode**
- The 8 Dungeon World classes (fighter, wizard, cleric, thief, ranger, bard, paladin, druid), a
  standard array or manual ability scores, and class-specific equipment choices
- Move interpretation → 2d6 roll → narrated result, with weapon tags (precise, reach, ranged, …)
  and armour taken into account
- Live HP, inventory (stacked quantities), coins and enemy/companion panels; XP and level-up choices
- Multiple game slots you can switch between, recovered after a server restart
- Suggested actions for when you are stuck

**Character Chat**
- Define a world plus multiple characters, a scenario, an opening greeting and a user persona
- Per-speaker images, five response-length steps (a creator-recommended value plus a per-player
  adjustment)
- Response streaming on OpenAI-compatible providers (OpenAI, DeepSeek, Grok, Qwen, custom)
- App shell: Browse (home), My Chats, Create and Profile as bottom tabs. A conversation rises above
  the tabs as a full screen and the tab bar hides. It is built mobile-first (`100dvh`, safe-area,
  work details as a bottom sheet)
- It never auto-creates an empty settings form when you have no conversations — you see Browse
  first, and Create is an explicit tab choice

**Sharing and gallery**
- Publish a definition as private, link-shared or public in the gallery (conversations are not
  included — everyone who plays keeps their own)
- Tags, sorting, likes, comments, reports, and creator profiles
- Gallery cards are portrait with a large cover image. You can pick the cover yourself with the
  `☆ cover` toggle on the image row; if you don't, one is chosen automatically — scene shots are
  preferred over character shots, and a character shot is recognised by whether its tag starts with
  a character name (`Luna-smile`)
- Operator panel: handling reports, visit statistics

## Project layout

```
server/
  index.js         Express + Socket.io server, socket event routing, slot manager
  gameSession.js   Core loop orchestration (interpret move → roll → narrate)
  rulesEngine.js   Dice, result bands, state changes (deterministic rules engine)
  dungeonWorld.js  Presets for the 8 classes, equipment, move summaries, level-ups
  aiGM.js          Builds the GM prompt/schema + provider dispatch
  chat.js          Builds the Character Chat system prompt (no rules, no dice)
  dungeonWorldEn.js English display names for Dungeon World data (the data itself stays Korean)
  auth.js          Verifies the shared session cookie + gm profile (provider, model, encrypted API key)
  messages.js      English translations of server error messages — applied at one response boundary
  store.js         Game slot persistence      (data/sessions/<userId>.json)
  chatStore.js     Character Chat persistence (data/chats/<userId>.json)
  publish.js       Registry of published definitions, likes, comments, reports (data/published.json)
  seedGallery.js   Registers the 7 sample worlds bundled with the repo into the gallery (by genre)
  seedGalleryEn.js English editions of the sample worlds (user-made worlds are never translated)
  uploads.js       Image upload storage/retrieval (data/uploads/)
  purge.js         Deletes a closed account's data and sweeps uploads nothing references
                   + the right-of-access export document, built in Korean and in English
  metrics.js       Daily visit statistics (IPs stored only as HMAC hashes)
  providers/
    geminiProvider.js     Gemini calls (responseSchema)
    anthropicProvider.js  Claude calls (Structured Outputs)
    openaiCompatProvider.js  OpenAI-compatible factory (OpenAI, DeepSeek, Grok, Qwen, custom)
assets/sample/
  *.png                Sample world images (drop a file in and it is registered on next start)
  IMAGE_PROMPTS.md     Generation prompts and filename conventions for the 31 sample images not yet drawn
public/
  common.js        Shared skeleton for all three pages — injects the user bar, ⚙ Settings and 🧠 model modal, account state
  i18n.js          Korean/English dictionary and switching (`window.I18N`, `t()`, `data-i18n`)
  index.html/.js   /      Landing — sign in/sign up + mode selection (no socket)
  play.html/.js    /play  Dungeon World — character creation wizard + game screen
  chat.html/.js    /chat  Character Chat — bottom-tab app shell (Browse, My Chats, Create, Profile) + conversation screen
  style.css        Styles shared by all three pages (chat-only app shell stays scoped inside `body.app-chat`)
  favicon.svg      Tab icon source (a d20). Change it and re-run the script below
  favicon.ico      favicon.svg rasterised to 32x32 — what crawlers that ignore <link> hit
scripts/
  build-favicon.js favicon.svg → favicon.ico, zlib only, no dependencies (ICO carries a PNG as-is)
```

### Adding one more AI provider

Four places. The screen side used to be three; the list is now kept in one spot
(`PROVIDER_OPTIONS` in `public/common.js`), which brings it down to two.

| What | Where |
|---|---|
| The actual call | `PROVIDERS` in `server/aiGM.js` — for anything OpenAI-compatible, one `makeProvider({ baseURL, defaultModel })` line |
| The dropdown | `PROVIDER_OPTIONS` in `public/common.js` — the ⚙ settings modal, the 🧠 model modal and the pre-`/api/config` fallback all come from here |
| Wording | `prov.<id>` in `public/i18n.js` (Korean and English) |
| Where to get a key | `KEY_URLS` in `public/common.js` |

`PROVIDER_NAMES` on the server comes from the keys of `PROVIDERS`, and the client
overwrites its own fallback with whatever `/api/config` returns. So **a provider added
only on the screen quietly disappears from the list** — and the other way round too.

`favicon.ico` is generated but committed, because there is no build step. If you change the
shape, edit `public/favicon.svg` **and** `scripts/build-favicon.js` together, re-run it, and
commit the result alongside.

The three pages live on the same server and the same origin. Accounts, API keys and socket
authentication (cookies) are shared as-is; only the screens and scripts are separate.

Opening `/play` or `/chat` while signed out sends you to `/?next=<original path>` via `common.js`,
and `landing.js` returns you there right after signing in. `next` can be tampered with in the
address bar, so `safeNext()` only lets same-origin `/play` and `/chat` through (anything else is
dropped and you land on the home page).
An older shared link of the form `/?play=<id>` takes precedence over `next`.


## Language (Korean · English)

Korean is the source language. When a key is missing from the dictionary the UI falls back to
**Korean, not English** — a missing translation never leaves the screen blank. The chosen language
lives in `localStorage` only (no cookie — section 9.1 of the privacy policy states that the only
cookie is the sign-in one), and is carried between subdomains with a `?lang=en` link.

Rules specific to this app:

- **The language of AI output is fixed per game and per conversation.** The screen language at
  creation time is baked in as `session.lang` / `chat.lang`, and toggling later does not change a
  story already in progress. The one exception is playing someone else's world from the gallery,
  which uses the **player's** screen language — playing a Korean world in English is the point of
  that feature.
- **Image tags sent to the AI are never translated.** `extractImage` in `chat.js` matches
  `[img:tag]` as an exact string, so if the model translates the tag too, the image silently
  disappears with no error. The English prompt insists the tag be copied character for character.
- **Dungeon World data is not translated.** The Korean strings for classes, gear and weapon tags are
  the keys that saves and prompts use to refer to each other (for example the aiGM rule "'정밀'
  means DEX"). They are mapped through `dungeonWorldEn.js` only for display and for the English
  prompt.
- **User-made worlds are not translated.** The original text is the stored value, so it is left
  as-is and the gallery card carries an original-language badge when it differs from the screen
  language (`shownLang` in `publish.js`). Only the 7 samples — text we wrote ourselves — have
  English editions, in `seedGalleryEn.js`.
- **Tags (genres) are stored as one original value and only translated for display.** Storing a
  different value per language would split one genre into two in the gallery filter.
- **Server error messages are translated at a single response boundary.** Instead of keying each
  route, `messages.js` maps the Korean original to English. There are only two boundaries — the
  express `res.json` wrapper and the socket `emit('error')` — and anything missing from the table
  goes out in Korean. The language arrives via the REST `X-Lang` header and the socket handshake
  query (plus a `setLang` event).
- **Tag the "My account" link with `data-langhref`.** `apply()` rewrites that address through
  `withLang()` so it carries the current language. Since no cookie is used, this is the only way
  the language reaches a subdomain.
- **The export document comes in two versions too.** `purge.exportUser(userId, account, lang)`
  builds English keys when given `en`. The labels on gallery entries are translated as well,
  but the entries themselves and the chat/session content are user-created data and are left
  alone. The language arrives in the **body** of auth's internal call — not a header, since
  this is a loopback call where CORS does not apply and the body is already parsed.
- **Never send `X-Lang` to the single sign-on service — use the query (`?lang=`) instead.**
  Unlike `api()`, `authApi()` calls **a different origin** (auth.elcherlab.com). The moment a
  custom header is attached a CORS preflight fires, and auth's `Access-Control-Allow-Headers` is
  `Content-Type` only, so the whole request is blocked.

  This actually happened: the i18n work added `X-Lang` to `authApi` too, and **login was
  completely dead with "Failed to fetch" regardless of language.** The landing page still looked
  fine, so it went unnoticed for a while.

  ```
  Request header field x-lang is not allowed by Access-Control-Allow-Headers
  ```

  auth reads `?lang=en` and returns its error messages in that language. `api()` is same-origin
  and the server really does read the header, so it stays as it is.
- **Opening the page is not a test of login.** That is exactly why the failure above went
  unnoticed. After touching this, click through it: a wrong password down to the error message,
  and a correct password down to a successful sign-in.

## Storage and security

- Storage is JSON files under `data/`. It runs without a separate database.
- Published definitions (`published.json`) are parsed once and cached in memory, because a single
  gallery screen reads them several times (`listPublic`, `listTags`, …). The cache is keyed on the
  file's mtime and size, so an edit made outside the process is still picked up.
- **This app does not own accounts or sessions.** Sign-up, sign-in and sign-out belong to the
  single sign-on service (`auth.elcherlab.com`); here the `.elcherlab.com` domain cookie is only
  **verified locally** with a shared secret (the auth server is not called per request, so existing
  sessions survive if auth is briefly down). All that remains in `data/users.json` is the
  gm-specific profile (provider, model, API key), keyed by the unified account uuid.
- **API keys are stored encrypted with AES-256-GCM.** They are only ever decrypted on the server and
  are never sent to the client. Encryption still uses `APP_SECRET` — ciphertext cannot be decrypted
  after moving it to another service, which is why it was not handed to the single sign-on service.
- The secret used for encryption and signing is `APP_SECRET`. If unset, the server generates one and
  keeps it in `data/.app_secret` (surviving redeploys). **If that file disappears, the stored API
  keys cannot be decrypted.**
- Visit statistics never store the original IP (HMAC with a server salt, first 12 characters only).
- Uploaded images are reached by an unguessable random id (a capability URL) — anyone who knows the
  id can view it.

## Environment variables

`.env.example` documents them with comments. Only `AUTH_SECRET` is required; the rest are optional.

| Variable | Default | Description |
|------|--------|------|
| `AUTH_SECRET` | (required) | Shared secret used to verify the single sign-on session cookie. The server refuses to start without it |
| `AUTH_ORIGIN` | `https://auth.elcherlab.com` | Where sign-up, sign-in and sign-out are sent |
| `SESSION_COOKIE_NAME` | `elab_session` | Name of the shared session cookie |
| `PORT` | 3000 | Server port |
| `HOST` | `127.0.0.1` | Bind address. Loopback only, assuming a reverse proxy in front. Use `0.0.0.0` if you need an external interface, e.g. in a container |
| `NODE_ENV` | — | `production` adds the Secure flag to the auth cookie |
| `APP_SECRET` | auto-generated | Secret for session signing and API-key encryption |
| `ADMIN_USER` | `elcher` | Account id granted the operator panel (reports, statistics) |
| `SAMPLE_OWNER` | `elcher` | Account id the sample worlds are handed to |
| `LOCAL_LLM_URL` | — | When set, opens the free-trial provider (OpenAI-compatible endpoint) |
| `LOCAL_LLM_MODEL` | `gemma3:4b` | Free-trial model |
| `LOCAL_LLM_TIMEOUT_MS` | 180000 | Free-trial response timeout |
| `LOCAL_LLM_STALL_MS` | 120000 | How long to wait for the first streamed chunk |
| `LOCAL_LLM_NO_THINK` | 1 | Set to 0 to disable the no-think instruction |
| `FREE_TRIAL` | — | `off` closes just the free trial while leaving the settings above in place |
| `FREE_LIMIT_PER_HOUR` | 30 | Free-trial calls per user per hour |

## Copyright

Dungeon World's rule mechanics (the 2d6 roll) are free to implement, but the move and class
description text from the rulebook has been summarised and rewritten from scratch here (no verbatim
copying). Checking the licence before distribution is recommended.
