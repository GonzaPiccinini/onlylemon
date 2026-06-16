# WhatsApp Chat (`feat/whatsapp-chat-ui`)

WhatsApp chat for the dashboard: admins and cashiers read and reply to their
WhatsApp conversations from inside the app, with realtime updates, media,
reactions, statuses/stories and browser notifications.

The whole feature is backed by **WAHA** (WhatsApp HTTP API — WAHA Plus, GOWS
engine `2026.3.4`). In V1 there is **no Postgres mirror of messages**: every read
and write proxies to WAHA on demand. The repository layer is built as the seam
where a Postgres mirror would slot in later (V2) without changing anything above it.

- **Backend:** `worker/` (Express + BullMQ + Prisma)
- **Frontend:** `dashboard/` (React + TypeScript + TanStack Query)
- **Scale:** ~91 files, ~13.4k LOC, 14 test files (~224 test cases)

---

## Table of contents

- [Architecture](#architecture)
- [Backend (worker)](#backend-worker)
  - [Layering](#layering)
  - [Modules](#modules)
  - [HTTP endpoints](#http-endpoints)
  - [Realtime / SSE](#realtime--sse)
  - [WAHA integration](#waha-integration)
  - [Inbound webhook → SSE flow](#inbound-webhook--sse-flow)
  - [Server wiring & schema](#server-wiring--schema)
- [Frontend (dashboard)](#frontend-dashboard)
  - [API layer & types](#api-layer--types)
  - [Pages & routing](#pages--routing)
  - [Components](#components)
  - [Hooks](#hooks)
  - [Realtime in the UI](#realtime-in-the-ui)
  - [Helpers](#helpers)
- [Cross-cutting UX features](#cross-cutting-ux-features)
- [Design decisions, V1 limits & V2 seams](#design-decisions-v1-limits--v2-seams)
- [Testing](#testing)
- [Configuration](#configuration)

---

## Architecture

```
Dashboard ──HTTP──► chat.routes ─► chat.controller ─► chat.service ─► chat.repository ─► waha/client ──► WAHA
   ▲                                                       (ownership + rate-limit + session resolve)
   │ SSE
   └── realtime.routes (/chat/stream) ◄── chat.events bus ◄── chat-fanout ◄── inbound/processor ◄──webhook── WAHA
```

Two pillars:

1. **Everything is dependency-injected** via factory functions
   (`createChatService`, `createChatRepository`, `createChatController`,
   `createChatRouter`, `createRequireSessionOwnership`, `createRateLimiter`,
   `createChatMessageFanout` / `createChatReactionFanout`,
   `createInboundProcessor`). Each layer is unit-testable without DB / WAHA /
   network. Real wiring lives in lazy `createDefault*()` async factories that
   dynamically `import()` Prisma/WAHA, so there is no top-level env/DB import.
2. **The repository is the V1→V2 mirror seam.** It is WAHA-only today; a future
   Postgres mirror would implement the same `ChatRepository` interface and
   nothing above it would change.

---

## Backend (worker)

### Layering

`routes → controller → service → repository → WAHA client` for synchronous
request/response. Inbound realtime is a separate path:
`BullMQ processor → chat-fanout → in-process event bus → SSE stream`.

### Modules

All paths under `worker/src/`.

| Module | File | Responsibility |
|---|---|---|
| Types | `modules/chat/chat.types.ts` | Pure domain types: `ChatMessage`, `ChatListEntry`, `ChatReactionSummary`, `QuotedMessage`, and the SSE bus payloads `ChatMessageEvent` / `ChatReactionEvent`. |
| Repository | `modules/chat/chat.repository.ts` | The V2-mirror seam — thin WAHA-delegating layer that maps WAHA shapes to domain types. Tolerates WAHA shape variance (`mapWahaReactions` reads `text ?? emoji`; GOWS uses `text`). |
| Service | `modules/chat/chat.service.ts` | Business logic: resolve `sessionId → WhatsappSession`, enforce ownership, enforce per-session rate limiting, delegate to repository. Typed errors `ChatForbiddenError` (403), `ChatRateLimitError` (429), `ChatSessionNotFoundError` (404). |
| Controller | `modules/chat/chat.controller.ts` | HTTP handlers: Zod-validate params/body/query, extract `req.authUser`, map typed errors to status codes. |
| Routes | `modules/chat/chat.routes.ts` | Defines the cashier- and admin-scoped route groups. Auth middleware is **injected** so tests can build the router without the DB-backed auth module. |
| Event bus | `modules/chat/chat.events.ts` | In-process realtime bus (single Node `EventEmitter`). `publish/subscribeChatMessage`, `publish/subscribeChatReaction`. |
| Fan-out | `modules/chat/chat-fanout.ts` | Bridges the BullMQ inbound processor to the bus: resolves `sessionName → {sessionId, cashierId}`, builds and publishes bus events. **Best-effort: never throws** (so it can't trigger BullMQ retries). |
| Rate limiter | `modules/chat/rate-limiter.ts` | Per-session token bucket (`capacity 10`, refill `500ms` ≈ 2 tok/s), injectable clock. |
| Upload | `modules/chat/upload.middleware.ts` | Multer memory storage (5 MB cap, `image/jpeg\|png\|webp` allowlist) + `sniffImageMagicBytes` magic-byte verification. |
| Ownership | `middlewares/require-session-ownership.middleware.ts` | Cashier-owns-session guard; ADMIN/SUPER_ADMIN bypass. Attaches `req.resolvedSession`. |
| Realtime | `modules/realtime/realtime.routes.ts`, `modules/realtime/chat-stream.helpers.ts` | SSE endpoints + visibility helpers. |

### HTTP endpoints

All mounted under `/api`. Cashier routes chain
`requireAuth → requireRole('CASHIER') → requireSessionOwnership → handler`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/chat/sessions/:sessionId/chats` | List chats (paginated) |
| GET | `/api/chat/sessions/:sessionId/chats/:chatId/messages` | Chat history (paginated, default 30 / max 100) |
| POST | `/api/chat/sessions/:sessionId/chats/:chatId/messages` | Send text (rate-limited) |
| POST | `/api/chat/sessions/:sessionId/chats/:chatId/messages/:messageId/reactions` | Send/remove reaction (**not** rate-limited) |
| GET | `/api/chat/sessions/:sessionId/chats/:chatId/messages/:messageId/media` | Media proxy (downloads bytes) |
| POST | `/api/chat/sessions/:sessionId/chats/:chatId/media` | Send photo (multipart, rate-limited; no `replyTo` in V1) |
| POST | `/api/chat/sessions/:sessionId/status/text` | Publish text status/story (rate-limited) |
| POST | `/api/chat/sessions/:sessionId/status/image` | Publish image status (multipart, rate-limited) |
| PATCH | `/api/chat/sessions/:sessionId/alias` | Set/clear the session alias |

Admin routes mirror these under
`/api/admin/chat/cashiers/:cashierId/sessions/:sessionId/...` and chain
`requireAuth → requireRole('ADMIN','SUPER_ADMIN') → handler` — **flat scope, no
ownership middleware** (a 404 is returned from the service when the session
doesn't exist). The `:cashierId` path param is *not* used for authorization;
only `:sessionId` resolves the session. Admin messages are delivered from the
cashier's WhatsApp number.

**Validation (Zod):** history `limit` 1–100 (default 30) / `offset` ≥0; text
1–4096 chars; reaction empty string allowed (= remove); status text 1–700 +
optional `backgroundColor` hex `#RRGGBB`; alias max 60 chars, nullable. Photo
routes run after `uploadSingleFile`: 400 if no file, 415 if magic bytes don't
match the declared MIME, 413 if over 5 MB.

### Realtime / SSE

`modules/realtime/realtime.routes.ts` exposes (under `/api/realtime`):

- `GET /api/realtime/chat/stream` — the chat stream. Auth via `?token=` query
  **or** `Authorization: Bearer` (EventSource can't set headers, hence the query
  fallback). Resolves the visible cashier set once at connect
  (`resolveVisibleCashierIds`): a CASHIER sees only its own `cashierId`;
  ADMIN/SUPER_ADMIN see all. Subscribes to both bus topics and, gated by
  `isEventVisible`, writes SSE events `chat-message-received`,
  `chat-message-reaction`, plus a `ping` heartbeat every 20s.
- `GET /api/realtime/cashier/runtime-state/stream` — pre-existing, not
  chat-specific.

### WAHA integration

`integrations/waha/client.ts` wraps WAHA HTTP (`config.WAHA_BASE_URL` +
`X-Api-Key`). Chat-relevant functions: `listChats`, `getChatMessages`,
`getMessageById`, `sendText` (`reply_to`), `sendImage` (base64 `data`),
`sendReaction` (**`PUT /api/reaction`**, `''` removes), `sendTextStatus`,
`sendImageStatus`, `downloadMedia`, plus session-events helpers `getSessions`,
`updateSessionConfig`, `getOwnChatId`.

Notable client behaviors:

- **`getMessageById(..., {downloadMedia:true})`** fetches a single message
  directly and returns `null` on 404. `downloadMedia=true` makes WAHA populate
  `media.url` on demand even for old messages — this is what lets media resolve
  regardless of age (the previous list-scan approach 404'd anything older than
  its 50-message window; fixed in `f3e059c`).
- **`downloadMedia`** rewrites a `localhost:3000`/`127.0.0.1:3000` origin to
  `config.WAHA_BASE_URL` (WAHA's S3 proxy advertises its own external address,
  unreachable from inside the container). Its mimetype is the response header
  (`application/octet-stream`), which is why the repository overrides it with the
  message metadata mimetype.

`integrations/waha/ensure-session-events.ts` —
`ensureSessionsSubscribedToReactions(...)` is an idempotent boot fixup: any WAHA
session whose webhook `events[]` predates `message.reaction` gets it added
(preserving the rest of the webhook config). Never throws if WAHA is unreachable.

### Inbound webhook → SSE flow

`queues/inbound/processor.ts` is the BullMQ worker. It parses webhooks with Zod
(`message`/`message.any`, `message.reaction`, `session.status`), runs the
existing routing (idempotency, session status, auto-conversion trigger, leads
mapping) and **additively** fans out chat events:

- `message` / `message.any` → `mirrorChatMessage(...)` is called
  **unconditionally** (the chat UI must receive every inbound *and* outbound
  message regardless of routing).
- `message.reaction` → `mirrorChatReaction(...)`. GOWS uses flat
  `reaction.messageId` with `payload.to: null`; legacy WEBJS uses
  `reaction.msgId._serialized`.

**Canonical chatId resolution** (`resolveCanonicalChatId` / `toCanonicalChatId`):
WAHA addresses LID chats as `<lid>@lid`, but the chat list/history key on the
phone JID `<phone>@c.us`. The processor picks the first candidate that normalizes
to `@c.us` (directional Alt → opposite Alt → `Info.Chat` → NOWEB
`remoteJidAlt` → raw `from`), leaves `@g.us` groups unchanged, and drops
`@lid`/empty. This guarantees realtime updates land in the right chat bucket.

```
WAHA webhook → BullMQ inbound → processInboundJob
  → Zod parse + idempotency
  → mirrorChatMessage / mirrorChatReaction (chat-fanout)
      → getSessionBySessionName: sessionName → {sessionId, cashierId}
      → publishChatMessage / publishChatReaction (chat.events bus)
        → realtime /chat/stream subscribers
            → isEventVisible(event, visibleCashierIds) gate
            → SSE: chat-message-received / chat-message-reaction → Dashboard
```

### Server wiring & schema

- `app/server.ts` mounts the chat router under `/api` via a lazy initializer
  (no top-level await): the first `/api` request builds and caches the router.
  `realtimeRouter` is mounted at `/api/realtime`. On `listen`,
  `ensureSessionsSubscribedToReactions(...)` runs fire-and-forget.
- `prisma/schema.prisma`: `WhatsappSession` gains `alias String?` (nullable
  human-friendly label). Migration
  `20260610011905_add_whatsapp_session_alias` adds a single nullable column, no
  backfill.
- `scripts/waha-shape-smoke.ts` — one-shot diagnostic that probes a live WAHA
  instance for the response shapes the feature relies on (sessions, chats,
  messages, send endpoints, reaction path, reply param name, reaction webhook).
  Source of the "Batch 0 findings" comments throughout the chat module.

---

## Frontend (dashboard)

React + TypeScript on TanStack Query (infinite queries + mutations), a shared
Axios instance with Bearer auth, and a single SSE `EventSource` for realtime. All
UI strings are Spanish (es-AR). Paths below under `dashboard/src/`.

### API layer & types

- `api/chat.service.ts` — one service for both roles. A `ChatScope`
  (`CashierScope | AdminScope`) discriminator selects the URL prefix, so there is
  no duplicated role logic. Methods: `listChats`, `getChatHistory`, `sendText`,
  `sendReaction`, `sendPhoto`, `fetchMediaBlob`, `publishTextStatus`,
  `publishImageStatus`, `setSessionAlias`, `getChatStreamUrl`.
  - **Media auth:** the media route only accepts an `Authorization` header (no
    `?token=`), so `fetchMediaBlob` pulls bytes via Axios and turns them into an
    object URL — a bare `<img src>` can't authenticate. The SSE route *does*
    accept `?token=` because EventSource can't set headers.
- `api/endpoints.ts` — adds the `chat` endpoint group (cashier- and
  admin-scoped parallel sets). Reuses the pre-existing shared Axios instance
  (`api/http.ts`) with its Bearer interceptor + 401 refresh-retry.
- `types/chat.ts` — mirrors the worker's `chat.types.ts`: `ChatMessage`,
  `ChatReactionSummary`, `QuotedMessage`, `ChatListEntry`, the SSE payloads, and
  `ChatStreamEvent` (discriminated union `chat-message-received` |
  `chat-message-reaction` | `ping`).

### Pages & routing

Two routes added in `app/router.tsx`, both inside `AppShell` behind `RoleGuard`:

- `/admin/chat` → `AdminChatPage` (`ADMIN`, `SUPER_ADMIN`)
- `/cashier/chat` → `CashierChatPage` (`CASHIER`)

A "WhatsApp" nav entry (MessageCircle icon) is added to both admin and cashier
nav in `components/app/app-shell.tsx`.

- `features/chat/chat-page.tsx` — the shared 3-pane layout (the heart). Generic
  over `scope` + `sessions`, with optional `cashierPicker` / `emptyCta` slots.
  Handles session/chat selection (restored from localStorage, stale ids cleared
  during render to stay lint-safe), flattens + de-dupes infinite-query pages,
  mounts `useChatStream` at page level (so non-active chats stay live), and wires
  send/reply/status/mobile-sheet state. Desktop = two columns (WhatsApp Web
  style); mobile = full-width list with a slide-in conversation overlay.
- `features/chat/cashier-chat-page.tsx` — loads the cashier's own sessions,
  filters to `wahaStatus === 'WORKING'`, renders `ChatPage` with a cashier scope.
- `features/chat/admin-chat-page.tsx` — pick-a-cashier-first (in-file
  `CashierPicker`), then loads that cashier's sessions (all statuses) and renders
  `ChatPage` with an admin scope and the cashier picker slot.

### Components

`features/chat/components/`:

| Component | Does |
|---|---|
| `ChatList` | Chat rows (name + relative time, no body preview), unread dot + bold name, skeleton/empty states, "Cargar más chats". |
| `ChatHeader` | Conversation top bar: avatar, title, session subtitle, optional mobile back arrow. |
| `MessageThread` | Scrollable list with smart scroll (jump to bottom on open, follow when near bottom, preserve viewport on prepend), day dividers, "Cargar mensajes anteriores". |
| `MessageItem` | One bubble (inbound vs `fromMe`): quoted reply, media, body, timestamp, reactions row, hover reply/react actions. Sticker-only renders bubble-less. |
| `Composer` | Textarea (Enter sends, Shift+Enter newline), attach (image), emoji insert, attachment preview. Reply mode is suppressed while an attachment is staged (no photo `replyTo` in V1). |
| `EmojiPicker` | `emoji-mart` picker, lazy-loaded as a separate chunk. |
| `MediaPreview` | Renders message media via `useMediaBlob`: image thumbnail + enlarge dialog, sticker special-case, PDF tile, graceful "Media no disponible" fallback. |
| `AttachmentPreview` | Thumbnail of a staged outbound file (object URL revoked on unmount). |
| `QuotedReply` | Quoted-message preview block (in `MessageItem` and in `Composer`). |
| `SessionPicker` | Session selector: static label for 1 session, custom keyboard-accessible dropdown for 2+. Label priority alias → `+phone` → sessionName; status dot. |
| `SessionAliasEditor` | Inline alias editor (used on the session-management pages, not the chat pages). |
| `StatusComposerDialog` | Publish a status: Texto tab (text + bg-color swatches + live preview) / Imagen tab (file + caption). |
| `NotificationToggle` | Opt-in browser-notification control. |

### Hooks

`features/chat/hooks/`:

| Hook | Does |
|---|---|
| `useChatList` | Infinite query of chats (20/page, offset cursor). |
| `useChatHistory` | Infinite query of history (50/page, numeric offset cursor — replaced a broken message-id cursor that caused dup/out-of-order messages). |
| `useChatStream` | The SSE client (see below). |
| `useSendMessage` | Send-text mutation with optimistic tile + rollback; reconciled against the SSE echo (±`RECONCILE_WINDOW_MS` = 5s). |
| `useSendPhoto` | Send-photo mutation (no optimistic tile — relies on `isPending` + history invalidation). |
| `useSendReaction` | Reaction mutation, optimistic update of the message's reactions. |
| `usePublishStatus` | `publishText` / `publishImage` mutations (fire-and-forget). |
| `useMediaBlob` | Fetches media as an object URL, revokes on unmount/param change, `null` on 404. |
| `useSetSessionAlias` | Alias mutation; invalidates the scope's session-list query so the new name propagates. |
| `useLastSession` | localStorage persistence of last session/chat per scope, plus `rememberChatFor` for notification navigation. |
| `useNotificationPermission` | Wraps the Web Notifications permission flow. |

### Realtime in the UI

`useChatStream` opens one `EventSource` (URL from `getChatStreamUrl(token)`) and
updates TanStack Query caches directly:

- `chat-message-received` → merges into the history cache (drops the matching
  optimistic tile via fromMe + body + ±5s timestamp match), bumps the chat list,
  tracks unread (`!fromMe && chatId !== active`), and fires a browser
  notification unless the user is actively viewing that exact chat. An
  **open-thread fallback** invalidates the active history query because the SSE
  `chatId` may arrive as `@lid`/raw while the cache is keyed on `@c.us` — a
  refetch from WAHA returns the canonical id and guarantees the open chat
  updates.
- `chat-message-reaction` → updates the target message's reactions in the cache.
- Returns `{ unreadChatIds, markChatRead }`.

### Helpers

- `features/chat/contact.ts` — `resolveContactTitle` (real name, else `+digits`
  from the chatId).
- `features/chat/mime.ts` — `isStickerMime` (`image/webp` ≈ sticker, since
  WhatsApp re-encodes real photos to JPEG).
- `features/chat/time.ts` — `toMillis` (normalizes seconds vs ms via a `1e12`
  threshold), `isSameDay`, `formatMessageTime`, `formatDayLabel`.
- `features/chat/notifications.ts` — Web Notifications wrapper (returns
  `'unsupported'` when absent; no-ops unless granted).
- `hooks/use-is-mobile.ts` — reactive `matchMedia('(max-width: 767px)')`.

---

## Cross-cutting UX features

- **Notifications** — in-app OS notifications for incoming messages, suppressed
  only while actively viewing that exact chat; click focuses the window and
  navigates to that session/chat. Opt-in.
- **Unread indicators** — yellow dot + bold name, cleared on open.
- **Session alias** — editable label shown everywhere (picker, header);
  invalidation propagates the new name.
- **Status publishing** — text (bg-color + live preview) or image stories.
- **Emoji & reactions** — lazy-loaded emoji-mart for composing and reacting (one
  `fromMe` reaction per message; empty string removes).
- **Media** — authenticated blob fetch + object URLs; image enlarge; sticker
  special-case; PDF tiles; graceful fallback.
- **Mobile** — desktop two-pane vs mobile slide-in conversation overlay.
- **Pagination** — offset-based infinite queries (chat list 20/page, history
  50/page) with de-duping and scroll preservation on prepend.
- **Optimistic send + reconciliation** — text shows an optimistic tile
  reconciled against the SSE echo; photo uses pending state + invalidation.
- **Persistence** — last session/chat per scope in localStorage.

---

## Design decisions, V1 limits & V2 seams

- **Repository = mirror seam.** WAHA-only now; a Postgres message mirror would
  implement the same interface later. No DB message table in V1.
- **Two-tier auth.** Cashier routes enforce ownership in both the
  `requireSessionOwnership` middleware *and* the service's `resolveAndAuthorize`
  (authoritative). Admin routes are flat-scope (role guard only).
- **Rate limiting** shares one per-session token bucket across text/photo/status
  sends; reactions bypass it. In-process Map in V1 → Redis INCRBY in V2.
- **Realtime bus** is a single in-process `EventEmitter` → doesn't survive
  horizontal scaling. V2 → Redis pub/sub.
- **Upload security** — memory-only multer, 5 MB cap, MIME allowlist, plus
  controller-side magic-byte verification (WebP requires both RIFF + WEBP
  offsets, since RIFF alone also matches AVI/WAV).
- **Media** — direct `getMessageById` with `downloadMedia=true`; mimetype from
  message metadata, not the download header; localhost→WAHA URL rewrite for the
  S3 proxy.
- **Fan-out is best-effort** and never throws (protects BullMQ from retry storms).
- **LID→phone canonical chatId** ensures realtime updates land in the right
  chat bucket.
- **Deferred to V2:** photo + quoted reply (`replyTo` on image routes),
  closed-tab push notifications (Service Worker), Redis-backed bus + rate
  limiter, Postgres message mirror.

---

## Testing

14 test files, ~224 cases, all colocated `*.test.ts`. Run from `worker/`:

```bash
npm test                                           # all worker tests
npx tsx --test src/modules/chat/chat.repository.test.ts   # one file
```

Backend coverage spans repository, service, controller, routes, fan-out, events,
rate limiter, upload middleware, ownership middleware, realtime chat-stream, the
WAHA client, `ensure-session-events`, and the inbound processor (unit +
integration). Because every layer is dependency-injected, tests run with no DB,
no WAHA, and no network.

---

## Configuration

Backend env (WAHA + auth):

- `WAHA_BASE_URL`, `WAHA_API_KEY` — WAHA endpoint and key.
- `WAHA_WEBHOOK_EVENTS` — extra webhook events merged into the default set
  (`message.any`, `message.reaction`, `session.status`).
- `JWT_SECRET` — verifies the SSE `?token=` / Bearer token.

Frontend env:

- `realtimeBaseUrl` — base for the SSE `EventSource` (`/chat/stream?token=...`).

Docker compose (`docker-compose.local.yml`, `docker-compose.waha-vps.yml`) was
updated for the WAHA wiring used in local and VPS runs.
