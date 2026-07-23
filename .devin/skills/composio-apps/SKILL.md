---
name: composio-apps
description: Route user requests to the correct Composio-connected app. Lists all active connections (Gmail, Notion, Google Super, Reddit, LinkedIn, Gemini, Discord, YouTube) with the exact tool slugs, the 7 Composio meta-tools, end-to-end workflow examples, rate limits, and decision rules for when to use each. Invoke when the user says "composio", "connected apps", "use my apps", "post to linkedin", "send email", "search gmail", "save to notion", "post to reddit", "youtube comment", "discord message", "google drive", "google calendar", "google meet", "generate image", "generate video", "run python in sandbox", "composio trigger", or any task that touches one of the connected services.
---

# Composio Connected Apps — Routing & Workflow Skill

This skill documents every Composio toolkit that has an **ACTIVE** connection for this user, the 7 Composio meta-tools, end-to-end workflow examples with concrete arguments, rate limits, and decision rules for when to use each. Use this as the routing layer before executing any Composio tool.

---

## Table of contents

1. [The 7 Composio meta-tools](#the-7-composio-meta-tools)
2. [Limits & rate limits](#limits--rate-limits)
3. [Standard workflow (always follow this order)](#standard-workflow-always-follow-this-order)
4. [Active connections](#active-connections-ready-to-use-immediately)
5. [When to use each app — decision matrix](#when-to-use-each-app--decision-matrix)
6. [End-to-end workflow examples](#end-to-end-workflow-examples)
7. [Inactive / available but NOT connected](#inactive--available-but-not-connected)
8. [Routing quick-reference](#routing-quick-reference)
9. [Execution rules](#execution-rules)

---

## The 7 Composio meta-tools

Composio exposes **7 meta-tools** instead of thousands of individual app tools. The agent discovers app tools at runtime through search, then executes them.

| Meta-tool | What it does | When to call |
|---|---|---|
| `COMPOSIO_SEARCH_TOOLS` | Discover relevant tools across 1400+ apps with execution plans, connection status, and pitfalls | **Always first.** Pass `queries` (array of `{use_case, known_fields}`) and `session: {generate_id: true}` for a new workflow |
| `COMPOSIO_CREATE_PLAN` | Workflow builder that produces a complete step-by-step plan with `workflow_steps`, `complexity_assessment`, `decision_matrix`, `failure_handling`, `output_format` | After `SEARCH_TOOLS` for **medium or hard** tasks. Skip for easy single-tool tasks. Re-call when user pivots to a new use case |
| `COMPOSIO_MANAGE_CONNECTIONS` | Handle OAuth, API key, and other auth. Actions: `add`, `rename`, `list`, `remove` | When `SEARCH_TOOLS` shows `has_active_connection: false`. Show the returned `redirect_url` as a markdown link |
| `COMPOSIO_WAIT_FOR_CONNECTIONS` | Poll until a newly initiated connection becomes `ACTIVE` | Immediately after `MANAGE_CONNECTIONS` with `action: "add"` |
| `COMPOSIO_GET_TOOL_SCHEMAS` | Retrieve complete input schemas for specific tools | When `SEARCH_TOOLS` returns a tool with `hasFullSchema: false` |
| `COMPOSIO_MULTI_EXECUTE_TOOL` | Execute up to **50** logically independent tools in parallel across apps | After confirming ACTIVE connection and resolving all required inputs. Never chain outputs within one call |
| `COMPOSIO_REMOTE_WORKBENCH` | Run Python in a persistent remote Jupyter sandbox. State (imports, vars, files) persists across calls | For bulk ops, data transformations, multi-step logic, or large responses. Has helper functions: `run_composio_tool`, `invoke_llm`, `upload_local_file`, `proxy_execute`, `web_search`, `smart_file_extract` |
| `COMPOSIO_REMOTE_BASH_TOOL` | Execute bash commands in a remote sandbox for file ops, data processing, system tasks | When you need shell commands instead of Python. Same 180s limit |

### `COMPOSIO_SEARCH_TOOLS` — input parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `queries` | array | Yes | Each item: `{use_case: string (required), known_fields: string}`. Split independent actions into separate queries. Do NOT put personal identifiers (names, emails, IDs) in `use_case` — put those in `known_fields` as `key:value` pairs |
| `session` | object | Yes | `{generate_id: true}` for new workflow, or `{id: "EXISTING_ID"}` to continue |
| `limit` | integer | No | Max tools per query (default ~6) |

### `COMPOSIO_CREATE_PLAN` — input parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `difficulty` | `"medium"` \| `"hard"` | Yes | Skip planner for easy tasks |
| `known_fields` | string | Yes | Comma-separated `key:value` pairs (NOT an array). Max 2-3 short structured values. E.g. `"channel_name:pod-sdk, timezone:Asia/Kolkata"` |
| `primary_tool_slugs` | array | Yes | Tool slugs from `SEARCH_TOOLS` — never invent |
| `reasoning` | string | Yes | Short reasoning from search about how the tools accomplish the task |
| `related_tool_slugs` | array | Yes | Related tool slugs from search |
| `session_id` | string | No | Pass through from search |

### `COMPOSIO_MULTI_EXECUTE_TOOL` — input parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tools` | array (1-50) | Yes | Each: `{tool_slug, arguments, account?}`. `account` = alias or account ID for multi-account toolkits |
| `thought` | string | No | One-sentence high-level rationale |
| `sync_response_to_workbench` | boolean | Yes | Set `true` if response may be large or needed for later scripting. Saves full response to workbench while returning inline preview |
| `current_step` | string | No | Short enum like `FETCHING_EMAILS`, `GENERATING_REPLIES` |
| `current_step_metric` | string | No | Progress like `"10/100 emails"` |
| `session_id` | string | No | Pass through from search |

### `COMPOSIO_MANAGE_CONNECTIONS` — actions

| Action | Required fields | Description |
|---|---|---|
| `add` (default) | `name` (toolkit slug) | Creates new auth link. Enforces max account limit. Returns `redirect_url` |
| `list` | `name` | Lists all connected accounts (IDs, aliases, statuses). No side effects |
| `rename` | `name`, `account_id`, `alias` | Renames alias on existing account |
| `remove` | `name`, `account_id` | Deletes a connected account |

### `COMPOSIO_REMOTE_WORKBENCH` — sandbox helpers

| Helper | What it does |
|---|---|
| `run_composio_tool` | Execute any Composio tool (e.g. `GMAIL_SEND_EMAIL`) and get structured results |
| `invoke_llm` | Call an LLM for classification, summarization, content generation, data extraction |
| `upload_local_file` | Upload generated files (reports, CSVs, images) to cloud storage, get download URL |
| `proxy_execute` | Make direct API calls to connected services when no pre-built tool exists |
| `web_search` | Search the web for research or data enrichment |
| `smart_file_extract` | Extract text from PDFs, images, and other file formats in the sandbox |

---

## Limits & rate limits

### Organization rate limits (per 1-minute window)

| Plan | Rate limit | Window |
|---|---|---|
| Starter | 2,000 requests | 1 minute |
| Hobby | 2,000 requests | 1 minute |
| Growth | 10,000 requests | 1 minute |
| Enterprise | Custom | — |

Every authenticated endpoint draws from the **same budget** — tool execution, connected accounts, triggers, and the rest. The limit is your org's total across all API calls.

### Rate limit headers (on every response)

| Header | Description |
|---|---|
| `X-RateLimit` | Total requests allowed in current window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Window-Size` | Window size (e.g. `60s`) |
| `Retry-After` | Seconds until window resets (only on `429` responses) |

### Other hard limits

| Limit | Value |
|---|---|
| Max tools per `MULTI_EXECUTE_TOOL` call | **50** |
| `REMOTE_WORKBENCH` execution limit | **3 minutes (180s)** per cell — break large tasks into smaller cells |
| `REMOTE_BASH_TOOL` execution limit | **3 minutes (180s)** per command |
| Tools per `SEARCH_TOOLS` query | ~4-6 (use `limit` to adjust) |
| Gmail message size (with attachments) | 25 MB — use Drive links for larger |
| Reddit post body | ~40,000 characters |
| Reddit post title | 300 characters |
| LinkedIn post `author` | Must be real URN (`urn:li:person:<id>` or `urn:li:organization:<id>`) |
| Twitter/X text | 280 weighted chars (basic), longer for Premium |
| Twitter/X poll options | 2-4 options, max 25 chars each |
| Twitter/X poll duration | 5-10080 minutes |
| YouTube `maxResults` (channels) | 0-50 |
| YouTube `maxResults` (comments) | 1-100 |
| Notion `page_size` (users) | max 100 |
| Notion `page_size` (search) | 1-100, default 25 |
| Google Calendar `maxResults` | 1-250 |
| Gemini image URL | S3 URL can be short-lived — download/store promptly |

### Rate limit best practices

1. **Watch `X-RateLimit-Remaining`** on each response to know headroom.
2. **Honor `Retry-After`** on `429` — wait the given seconds before retrying.
3. **Cache what doesn't change** — keep tool definitions and static data client-side.
4. **Batch independent calls** via `MULTI_EXECUTE_TOOL` (up to 50) to reduce request count.
5. **Use `sync_response_to_workbench: true`** for large responses to avoid re-fetching.

---

## Standard workflow (always follow this order)

```
User request
    ↓
1. COMPOSIO_SEARCH_TOOLS({ queries: [{use_case, known_fields}], session: {generate_id: true} })
   → Returns tool_schemas, toolkit_connection_statuses, primary_tool_slugs, related_tool_slugs, recommended_plan_steps, known_pitfalls
    ↓
2. Check has_active_connection for each toolkit
   → If false: COMPOSIO_MANAGE_CONNECTIONS({ toolkits: [{name, action: "add"}] })
     → Show redirect_url as markdown link to user
     → COMPOSIO_WAIT_FOR_CONNECTIONS to poll until ACTIVE
    ↓
3. (Medium/hard tasks only) COMPOSIO_CREATE_PLAN({ difficulty, known_fields, primary_tool_slugs, reasoning, related_tool_slugs })
   → Returns workflow_steps, complexity_assessment, decision_matrix, failure_handling, output_format
    ↓
4. If any tool has hasFullSchema: false → COMPOSIO_GET_TOOL_SCHEMAS({ tool_slugs: [...] })
    ↓
5. COMPOSIO_MULTI_EXECUTE_TOOL({ tools: [{tool_slug, arguments, account?}], sync_response_to_workbench, current_step, session_id })
   → For multi-account toolkits (linkedin, youtube), ALWAYS pass account field
   → Batch independent tools; never chain outputs within one call
    ↓
6. (If response is large or needs processing) COMPOSIO_REMOTE_WORKBENCH({ code_to_execute })
   → Use run_composio_tool, invoke_llm, upload_local_file helpers
    ↓
7. Present results with inline markdown links to sources (Slack threads, doc URLs, post permalinks)
```

**Pass `session_id` through every meta call in a single workflow.** Use `{generate_id: true}` for the first call of a new use case; reuse the returned `id` for subsequent calls. When the user pivots to a new task, generate a new session ID.

---

## Active connections (ready to use immediately)

| Toolkit | Account | Account ID / Alias | Notes |
|---|---|---|---|
| `gmail` | helloatjh@gmail.com | `gmail_istoke-avery` (default) | 38,646 messages, 35,446 threads |
| `notion` | Johirul Hoq Akash's Notion | `notion_carder-premix` (default) | Bot integration, workspace `7bf2a1f1-2bb1-4e49-83bd-e527f1a50497` |
| `googlesuper` | helloatjh@gmail.com | `googlesuper_knur-winged` (default) | Unified Google: Drive, Calendar, Gmail, Sheets, Meet, Analytics, Ads |
| `reddit` | u/itsjhakash | `reddit_elod-coater` (default) | 111 karma, mod of own profile subreddit |
| `linkedin` | Johirul Hoq Akash (personal) | `linkedin_cuir-talcer` | Personal profile |
| `linkedin` | CodeMyPixel page | `linkedin_neckar-scraw` (alias `codemypixel-page`, default) | **Account selection required** — pass `account` field |
| `gemini` | No auth needed | — | Veo 3 video, Gemini Flash text, image gen |
| `discord` | im_jh_akash (Akash) | `discord_mamba-legume` (default) | Email helloatjh@gmail.com, verified |
| `youtube` | Johirul Hoq Akash (@im_jh_akash) | `youtube_eral-trah` | Personal channel |
| `youtube` | CodeMyPixel (@codemypixel) | `youtube_khaja-berne` | **Account selection required** — pass `account` field |
| `googledrive` | helloatjh@gmail.com | (default) | Standalone Drive toolkit (also covered by `googlesuper`) |
| `google_analytics` | helloatjh@gmail.com | (default) | GA4 properties, firebase links, traffic data |

---

## When to use each app — decision matrix

### 1. Gmail (`gmail`) — Email send/search/drafts

**Use when the user wants to:**
- Send an email → `GMAIL_SEND_EMAIL` (or `GMAIL_CREATE_EMAIL_DRAFT` + `GMAIL_SEND_DRAFT` for review-first)
- Search inbox by sender/subject/keyword/date → `GMAIL_FETCH_EMAILS` / `GMAIL_SEARCH_EMAILS`
- Read a specific thread → `GMAIL_GET_EMAIL` / `GMAIL_FETCH_A_EMAIL`
- Reply to a thread → `GMAIL_REPLY_TO_EMAIL` (use `thread_id`)
- Get attachments → `GMAIL_GET_ATTACHMENT`
- Mark read/unread, label, trash, archive → corresponding `GMAIL_*` tools

**Key slugs:** `GMAIL_SEND_EMAIL`, `GMAIL_CREATE_EMAIL_DRAFT`, `GMAIL_SEND_DRAFT`, `GMAIL_FETCH_EMAILS`, `GMAIL_SEARCH_EMAILS`, `GMAIL_REPLY_TO_EMAIL`, `GMAIL_GET_ATTACHMENT`

**Pitfalls:** Plain names without `@domain` are invalid recipients. For HTML body set `is_html: true`. For thread replies, leave `subject` empty to stay in the thread. 25 MB max message size.

---

### 2. Notion (`notion`) — Notes, docs, databases, wikis

**Use when the user wants to:**
- Find a page or database → `NOTION_SEARCH_NOTION_PAGE` (fallback: empty query to list all)
- Create a page, database, or row → `NOTION_CREATE_DATABASE_PAGE`, `NOTION_CREATE_DATABASE`, `NOTION_INSERT_ROW_DATABASE`
- Update/sync rows without duplicates → `NOTION_UPSERT_ROW_DATABASE`
- Query a database with filters → `NOTION_QUERY_DATABASE_WITH_FILTER`
- Append blocks to a page → `NOTION_APPEND_BLOCK`
- List workspace users → `NOTION_LIST_USERS`

**Key slugs:** `NOTION_SEARCH_NOTION_PAGE`, `NOTION_FETCH_DATA`, `NOTION_CREATE_DATABASE_PAGE`, `NOTION_UPSERT_ROW_DATABASE`, `NOTION_QUERY_DATABASE_WITH_FILTER`, `NOTION_APPEND_BLOCK`, `NOTION_LIST_USERS`

**Pitfalls:** Search indexing is not immediate — recently shared items may not appear. `NOTION_LIST_USERS` succeeding does NOT imply page access. Use `filter_properties` to reduce response size on databases with many properties. `page_size` max 100 for users, 1-100 for search.

---

### 3. Google Super (`googlesuper`) — Drive, Calendar, Sheets, Meet, Analytics, Ads

This is the **unified** Google toolkit. Prefer it over the standalone `googlecalendar` toolkit (which is NOT connected).

**Use when the user wants to:**

**Drive / Files:**
- Search files/folders → `GOOGLESUPER_FIND_FILE` (supports full Drive query syntax)
- Download a file or export a Doc/Sheet → `GOOGLESUPER_DOWNLOAD_FILE` (set `mime_type` for Workspace docs)
- Create folder, shared drive → `GOOGLESUPER_CREATE_FOLDER`, `GOOGLESUPER_CREATE_DRIVE`
- Upload, rename, share, get revisions → corresponding `GOOGLESUPER_*` tools

**Calendar:**
- List calendars → `GOOGLESUPER_LIST_CALENDARS`
- Create event with Meet link → `GOOGLESUPER_CREATE_EVENT` (auto-adds Meet; pass `start_datetime`, `timezone`, `event_duration_hour`/`end_datetime`, `attendees`)
- Find free slots → `GOOGLESUPER_FIND_FREE_SLOTS`
- Update/delete events → `GOOGLESUPER_UPDATE_EVENT`, `GOOGLESUPER_DELETE_EVENT`

**Google Meet:**
- Create a Meet space → `GOOGLESUPER_CREATE_MEET` (capture `meetingUri`, `meetingCode`, `space.name`)
- Get Meet details → `GOOGLESUPER_GET_MEET`

**Sheets:**
- Read/write cells, create spreadsheet → `GOOGLESUPER_*` sheets tools

**Pitfalls:** `timezone` must be a valid IANA name (e.g. `America/New_York`), NOT `EST`/`PST`. Calendar IDs look like emails — get them from `LIST_CALENDARS`. No conflict checking on event create — call `FIND_FREE_SLOTS` first if needed. Workspace-only features (recording, smart notes) require a Workspace edition. `maxResults` max 250 for calendars.

---

### 4. Reddit (`reddit`) — Posts, comments, subreddits

**Use when the user wants to:**
- Post to a subreddit → `REDDIT_CREATE_REDDIT_POST` (`kind: "self"` for text, `"link"` for URL; `subreddit` without `r/` prefix)
- Comment on a post → `REDDIT_SUBMIT_COMMENT`
- Get posts from a subreddit (hot/new/top/controversial/random) → `REDDIT_GET_HOT`, `REDDIT_GET_NEW`, `REDDIT_GET_TOP`, `REDDIT_GET_CONTROVERSIAL_POSTS`, `REDDIT_GET_RANDOM`
- Get subreddit rules/flairs → `REDDIT_GET_SUBREDDIT_RULES`, `REDDIT_LIST_SUBREDDIT_POST_FLAIRS`
- Subscribe/unsubscribe → `REDDIT_SUBSCRIBE_SUBREDDIT`

**Pitfalls:** Posts may be silently removed by automoderator — verify via returned `permalink`. Rapid calls trigger RATELIMIT. Some subreddits require flair (`SUBMIT_VALIDATION_FLAIR_REQUIRED`). Title max 300 chars, body max ~40,000 chars.

---

### 5. LinkedIn (`linkedin`) — Posts, articles, profile, company

**TWO accounts connected — always pass `account` field:**
- `linkedin_cuir-talcer` — personal profile (Johirul Hoq Akash)
- `linkedin_neckar-scraw` (alias `codemypixel-page`) — CodeMyPixel company page (default)

**Use when the user wants to:**
- Post text/media → `LINKEDIN_CREATE_LINKED_IN_POST` (`author` URN like `urn:li:person:<id>` or `urn:li:organization:<id>`)
- Share an article/URL → `LINKEDIN_CREATE_ARTICLE_OR_URL_SHARE`
- Upload image first → `LINKEDIN_REGISTER_IMAGE_UPLOAD` then reference in post
- Get own profile → `LINKEDIN_GET_MY_INFO`
- Get company info → `LINKEDIN_GET_COMPANY_INFO`

**Pitfalls:** Requires `w_member_social` scope for personal posts, `w_organization_social` for company. `author` must be a real URN — never a placeholder. Always confirm which account (personal vs CodeMyPixel page) before posting.

---

### 6. Gemini (`gemini`) — AI generation (no auth required)

**Use when the user wants to:**
- Generate an image from text → `GEMINI_GENERATE_IMAGE` (Nano Banana; capture `data.image.s3url`)
- Generate video from text → `GEMINI_GENERATE_VIDEO` (Veo 3)
- Text generation / chat → `GEMINI_GENERATE_TEXT` / `GEMINI_CHAT_COMPLETION`
- Multimodal analysis → Gemini multimodal tools

**Pitfalls:** Quota exhaustion returns HTTP 429 `RESOURCE_EXHAUSTED`. In batched execution the image URL may be nested per entry. S3 URLs can be short-lived — download/store promptly.

---

### 7. Discord (`discord`) — Messages, channels, guilds

**Use when the user wants to:**
- Send a message to a channel → `DISCORD_SEND_MESSAGE` (channel ID or name)
- Get channel/guild info → `DISCORD_GET_CHANNEL`, `DISCORD_GET_GUILD`
- List messages in a channel → `DISCORD_LIST_CHANNEL_MESSAGES`
- Manage roles, members, bans → corresponding `DISCORD_*` tools
- Get Gateway WebSocket URL → `DISCORD_GET_GATEWAY` (for real-time events)

**Pitfalls:** Bot must have access to the channel (`not_in_channel`, `channel_not_found` errors). Rate-limited ~1 req/sec on message sends.

---

### 8. YouTube (`youtube`) — Channels, videos, comments

**TWO accounts connected — always pass `account` field:**
- `youtube_eral-trah` — personal channel (@im_jh_akash)
- `youtube_khaja-berne` — CodeMyPixel channel (@codemypixel)

**Use when the user wants to:**
- List/search channels → `YOUTUBE_LIST_CHANNELS` (by `id`, `forHandle` like `@Google`, `forUsername`, or `mine: true`)
- Search videos → `YOUTUBE_SEARCH_YOU_TUBE`
- List channel videos / activities → `YOUTUBE_LIST_CHANNEL_VIDEOS`, `YOUTUBE_GET_CHANNEL_ACTIVITIES`
- List comments / replies → `YOUTUBE_LIST_COMMENTS` (use `parentId` for replies), `YOUTUBE_LIST_COMMENT_THREADS2`
- Post a comment → `YOUTUBE_POST_COMMENT`
- Subscribe/unsubscribe → `YOUTUBE_SUBSCRIBE_CHANNEL`, `YOUTUBE_UNSUBSCRIBE_CHANNEL`
- Get channel ID by handle → `YOUTUBE_GET_CHANNEL_ID_BY_HANDLE`

**Pitfalls:** Channel IDs start with `UC`. `maxResults` max is 50 for channels, 100 for comments. Use `pageToken` for pagination. Confirm which channel (personal vs CodeMyPixel) before posting comments.

---

### 9. Google Drive (`googledrive`) — Standalone Drive (also in `googlesuper`)

**Use when the user wants to:**
- Find a file → `GOOGLEDRIVE_FIND_FILE` (disambiguate close matches, capture `fileId`)
- Get file metadata → `GOOGLEDRIVE_GET_FILE_METADATA`
- Download a file → `GOOGLEDRIVE_DOWNLOAD_FILE` (capture `downloaded_file_content.s3url` — temporary URL, may expire)
- Export a Google Workspace file (Doc/Sheet/Slides) → `GOOGLEDRIVE_EXPORT_GOOGLE_WORKSPACE_FILE`
- Poll download operation → `GOOGLEDRIVE_DOWNLOAD_FILE_OPERATION`
- Upload a file → `GOOGLEDRIVE_UPLOAD_FILE` (requires `file_to_upload` object with `name`, `mimetype`, storage reference)

**Key slugs:** `GOOGLEDRIVE_FIND_FILE`, `GOOGLEDRIVE_GET_FILE_METADATA`, `GOOGLEDRIVE_DOWNLOAD_FILE`, `GOOGLEDRIVE_EXPORT_GOOGLE_WORKSPACE_FILE`, `GOOGLEDRIVE_UPLOAD_FILE`, `GOOGLEDRIVE_DOWNLOAD_FILE_OPERATION`

**Pitfalls:** `downloaded_file_content.s3url` is a temporary indirect URL — download promptly, verify non-zero saved size. Workspace-native mimeType needs `EXPORT_GOOGLE_WORKSPACE_FILE`. HTTP 403 `PERMISSION_DENIED` = missing scopes, re-authorize. Prefer `googlesuper` for unified Google access; use this standalone toolkit only when `googlesuper` lacks a specific Drive tool.

**Workbench snippet — extract fileId from share link:**
```python
import re
def extract_file_id(text):
    m = re.search(r"/d/([A-Za-z0-9_-]+)", text)
    return m.group(1) if m else None
```

**Workbench snippet — fetch bytes from temp URL:**
```python
import requests
def fetch_bytes(temp_url, timeout=60):
    r = requests.get(temp_url, timeout=timeout)
    r.raise_for_status()
    return r.content
```

---

### 10. Google Analytics (`google_analytics`) — GA4 properties & traffic

**Use when the user wants to:**
- List GA4 properties → `GOOGLE_ANALYTICS_LIST_PROPERTIES_FILTERED`
- Get property details → `GOOGLE_ANALYTICS_GET_PROPERTY`
- List Firebase links → `GOOGLE_ANALYTICS_LIST_FIREBASE_LINKS`
- Run reports / get traffic data → corresponding `GOOGLE_ANALYTICS_*` tools

**Key slugs:** `GOOGLE_ANALYTICS_LIST_PROPERTIES_FILTERED`, `GOOGLE_ANALYTICS_GET_PROPERTY`, `GOOGLE_ANALYTICS_LIST_FIREBASE_LINKS`

**Pitfalls:** Property selection matters — multiple properties may exist. Confirm the right property ID before running reports.

---

### 11. Cloudinary (`cloudinary`) — Media upload, transform, CDN delivery — **NOT connected**

**Use when the user wants to:**
- Upload an image/video asset → `CLOUDINARY_UPLOAD_ASSET` (use `file_url` for public direct links, `file` object otherwise; define stable `public_id` without folder path)
- Auto-detect upload source → `CLOUDINARY_UPLOAD_FILE_AUTO_DETECT` (fallback when `UPLOAD_ASSET` fails)
- Create folder → `CLOUDINARY_CREATE_FOLDER`
- Get asset by public_id → `CLOUDINARY_GET_RESOURCE_BY_PUBLIC_ID`
- Delete assets → `CLOUDINARY_DELETE_RESOURCES_BY_PUBLIC_ID`
- Validate config → `CLOUDINARY_GET_CONFIG`

**Key slugs:** `CLOUDINARY_UPLOAD_ASSET`, `CLOUDINARY_UPLOAD_FILE_AUTO_DETECT`, `CLOUDINARY_CREATE_FOLDER`, `CLOUDINARY_GET_RESOURCE_BY_PUBLIC_ID`, `CLOUDINARY_DELETE_RESOURCES_BY_PUBLIC_ID`, `CLOUDINARY_GET_CONFIG`

**Connection:** `has_active_connection: false` — call `COMPOSIO_MANAGE_CONNECTIONS({ toolkits: [{ name: "cloudinary", action: "add" }] })` first, show the auth link, then poll with `COMPOSIO_WAIT_FOR_CONNECTIONS`.

**Pitfalls:** Remote `file_url` fails with 404 if not a direct downloadable link. Persist `data.public_id` and `data.secure_url` immediately after upload. Temporary/signed source URLs may expire — re-host promptly. HTTP 400 on `UPLOAD_FILE_AUTO_DETECT` can mask an upstream HTTP 429 — retry sequentially in smaller batches.

---

### 12. Supabase (`supabase`) — Postgres, auth, storage, realtime — **NOT connected**

**Use when the user wants to:**
- List projects → `SUPABASE_LIST_ALL_PROJECTS` (pick the right environment)
- Get project → `SUPABASE_GET_PROJECT` (confirm reachable)
- Run read-only SQL → `SUPABASE_RUN_READ_ONLY_QUERY` (results under `data.result`, `data.rows_returned`)
- Check read-only mode → `SUPABASE_GET_PROJECT_READONLY_MODE_STATUS`
- List tables → `SUPABASE_LIST_TABLES` (nested under `data.schemas[].tables[]`, iterate all)
- Get table schemas → `SUPABASE_GET_TABLE_SCHEMAS`
- List migration history → `SUPABASE_LIST_MIGRATION_HISTORY`
- Apply a migration → `SUPABASE_APPLY_A_MIGRATION` (prefer for repeatability)
- Run SQL query (write) → `SUPABASE_BETA_RUN_SQL_QUERY` (fallback when migrations fail)

**Key slugs:** `SUPABASE_LIST_ALL_PROJECTS`, `SUPABASE_GET_PROJECT`, `SUPABASE_RUN_READ_ONLY_QUERY`, `SUPABASE_LIST_TABLES`, `SUPABASE_GET_TABLE_SCHEMAS`, `SUPABASE_APPLY_A_MIGRATION`, `SUPABASE_BETA_RUN_SQL_QUERY`, `SUPABASE_GET_PROJECT_READONLY_MODE_STATUS`

**Connection:** `has_active_connection: false` — call `COMPOSIO_MANAGE_CONNECTIONS({ toolkits: [{ name: "supabase", action: "add" }] })` first.

**Pitfalls:** Multiple connected accounts → easy to pick wrong project. `LIST_TABLES` response is nested and may be truncated — iterate all schemas. Read success does NOT imply write permissions. `BETA_RUN_SQL_QUERY` can fail with Postgres codes (`42P01`, `42P07`, `42501`, `42703`); multi-statement DDL may report `rows_affected=0` — verify with follow-up reads. **Always get explicit user confirmation before any DDL/DML write.**

---

## End-to-end workflow examples

### Example 1 — Send an email (easy, single tool)

```
1. COMPOSIO_SEARCH_TOOLS({
     queries: [{ use_case: "send an email to a recipient", known_fields: "recipient_email:jane@example.com" }],
     session: { generate_id: true }
   })
   → Returns GMAIL_SEND_EMAIL schema, gmail has_active_connection: true

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "GMAIL_SEND_EMAIL",
       arguments: {
         recipient_email: "jane@example.com",
         subject: "Project update",
         body: "Hi Jane,\n\nHere's the latest update...",
         is_html: false
       }
     }],
     sync_response_to_workbench: false,
     current_step: "SENDING_EMAIL",
     session_id: "<from search>"
   })
```

### Example 2 — Connect Slack then send a message (auth flow)

```
1. COMPOSIO_SEARCH_TOOLS({
     queries: [{ use_case: "send a message to a Slack channel" }],
     session: { generate_id: true }
   })
   → Returns SLACK_SEND_MESSAGE schema, slack has_active_connection: FALSE

2. COMPOSIO_MANAGE_CONNECTIONS({
     toolkits: [{ name: "slack", action: "add" }]
   })
   → Returns redirect_url
   → Show to user as markdown link: [Connect Slack](https://...)
   → User clicks and authenticates

3. COMPOSIO_WAIT_FOR_CONNECTIONS({ toolkits: ["slack"] })
   → Poll until status: ACTIVE

4. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "SLACK_SEND_MESSAGE",
       arguments: { channel: "general", markdown_text: "Hello from Composio!" }
     }],
     sync_response_to_workbench: false,
     session_id: "<from search>"
   })
```

### Example 3 — Parallel fan-out (3 independent reads in one batch)

User: "In parallel, fetch my last 10 Gmail emails, list my Linear issues, and get today's Google Calendar events. Redact personal info then summarize."

```
1. COMPOSIO_SEARCH_TOOLS({
     queries: [
       { use_case: "fetch last 10 Gmail emails" },
       { use_case: "list Linear issues assigned to me" },
       { use_case: "get today's Google Calendar events" }
     ],
     session: { generate_id: true }
   })
   → Returns GMAIL_FETCH_EMAILS, LINEAR_LIST_ISSUES_BY_TEAM_ID, GOOGLESUPER_LIST_EVENTS

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [
       { tool_slug: "GMAIL_FETCH_EMAILS", arguments: { max_results: 10 } },
       { tool_slug: "LINEAR_LIST_ISSUES_BY_TEAM_ID", arguments: { team_id: "<resolved>" } },
       { tool_slug: "GOOGLESUPER_LIST_EVENTS", arguments: { calendar_id: "primary", time_min: "<today>" } }
     ],
     sync_response_to_workbench: true,
     current_step: "FETCHING_DATA",
     current_step_metric: "0/3 sources",
     session_id: "<from search>"
   })

3. COMPOSIO_REMOTE_WORKBENCH({
     code_to_execute: "import re\n# load responses, redact emails/phones, invoke_llm for summary\nsummary = invoke_llm('Summarize these 3 data sources concisely', context=...)\nprint(summary)"
   })
```

### Example 4 — Post to LinkedIn company page (multi-account)

```
1. COMPOSIO_SEARCH_TOOLS({
     queries: [{ use_case: "post text update to LinkedIn company page", known_fields: "account:codemypixel-page" }],
     session: { generate_id: true }
   })

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "LINKEDIN_CREATE_LINKED_IN_POST",
       arguments: {
         author: "urn:li:organization:<company_id>",
         commentary: "Excited to share our latest AI integration case study!",
         visibility: "PUBLIC"
       },
       account: "linkedin_neckar-scraw"
     }],
     sync_response_to_workbench: false,
     session_id: "<from search>"
   })
```

### Example 5 — Search Notion then upsert rows (medium task, use planner)

```
1. COMPOSIO_SEARCH_TOOLS({
     queries: [{ use_case: "find a Notion database and upsert rows from a CSV" }],
     session: { generate_id: true }
   })
   → Returns NOTION_SEARCH_NOTION_PAGE, NOTION_UPSERT_ROW_DATABASE

2. COMPOSIO_CREATE_PLAN({
     difficulty: "medium",
     known_fields: "database_name:Leads",
     primary_tool_slugs: ["NOTION_SEARCH_NOTION_PAGE", "NOTION_UPSERT_ROW_DATABASE"],
     reasoning: "Search for the database first to get its ID, then upsert rows matched by Email",
     related_tool_slugs: ["NOTION_QUERY_DATABASE_WITH_FILTER"],
     session_id: "<from search>"
   })
   → Returns workflow_steps

3. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "NOTION_SEARCH_NOTION_PAGE",
       arguments: { query: "Leads", filter_value: "database" }
     }],
     session_id: "<from search>"
   })
   → Extract database_id

4. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "NOTION_UPSERT_ROW_DATABASE",
       arguments: {
         database_id: "<from step 3>",
         items: [
           { match: { property: "Email", equals: "lead1@example.com" },
             create: { properties: { Name: { title: [{text: {content: "Lead 1"}}] }, Email: { email: "lead1@example.com" } } },
             update: { properties: { Name: { title: [{text: {content: "Lead 1"}}] } } } }
         ]
       }
     }],
     session_id: "<from search>"
   })
```

### Example 6 — Generate an image with Gemini then save to Google Drive

```
1. COMPOSIO_SEARCH_TOOLS({
     queries: [
       { use_case: "generate an image from a text prompt" },
       { use_case: "upload a file to Google Drive" }
     ],
     session: { generate_id: true }
   })

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "GEMINI_GENERATE_IMAGE",
       arguments: { prompt: "A serene mountain landscape at sunset, vibrant orange and purple skies" }
     }],
     sync_response_to_workbench: true,
     session_id: "<from search>"
   })
   → Extract s3url from data.image.s3url

3. COMPOSIO_REMOTE_WORKBENCH({
     code_to_execute: "from composio import run_composio_tool\n# download image, then upload to Drive\nresult = run_composio_tool('GOOGLESUPER_UPLOAD_FILE', {'name': 'sunset.png', 'mimetype': 'image/png', 's3key': '<from step 2>'})\nprint(result)"
   })
```

### Example 7 — Schedule a Google Meet and email the link

```
1. COMPOSIO_SEARCH_TOOLS({
     queries: [{ use_case: "create a Google Calendar event with Meet link and email attendees", known_fields: "attendee:jane@example.com, duration:30" }],
     session: { generate_id: true }
   })

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "GOOGLESUPER_CREATE_EVENT",
       arguments: {
         summary: "Project sync",
         start_datetime: "2026-07-20T14:00:00",
         timezone: "America/New_York",
         event_duration_minutes: 30,
         attendees: ["jane@example.com"]
       }
     }],
     sync_response_to_workbench: false,
     session_id: "<from search>"
   })
   → Event auto-includes Meet link; attendees get email from Google automatically
```

### Example 8 — Post the same content to Reddit AND LinkedIn (parallel)

```
1. COMPOSIO_SEARCH_TOOLS({
     queries: [
       { use_case: "post a text post to a Reddit subreddit" },
       { use_case: "post a text update to LinkedIn personal profile" }
     ],
     session: { generate_id: true }
   })

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [
       { tool_slug: "REDDIT_CREATE_REDDIT_POST",
         arguments: { subreddit: "SideProject", title: "Launched my new AI tool", kind: "self", text: "Just launched..." } },
       { tool_slug: "LINKEDIN_CREATE_LINKED_IN_POST",
         arguments: { author: "urn:li:person:<person_id>", commentary: "Just launched my new AI tool...", visibility: "PUBLIC" },
         account: "linkedin_cuir-talcer" }
     ],
     sync_response_to_workbench: false,
     current_step: "POSTING_SOCIAL",
     session_id: "<from search>"
   })
```

### Example 9 — Process large Gmail search results in sandbox

```
1. COMPOSIO_SEARCH_TOOLS({ queries: [{ use_case: "fetch all emails from last 30 days matching 'invoice'" }], session: { generate_id: true } })

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{ tool_slug: "GMAIL_FETCH_EMAILS", arguments: { query: "invoice newer_than:30d", max_results: 100 } }],
     sync_response_to_workbench: true,
     session_id: "<from search>"
   })
   → Large response saved to workbench

3. COMPOSIO_REMOTE_WORKBENCH({
     code_to_execute: "import json\nemails = json.load(open('/workbench/gmail_results.json'))\n# Extract invoice amounts, summarize with LLM\nsummary = invoke_llm('Summarize these invoices by total amount and vendor', context=json.dumps(emails[:50]))\nprint(summary)\n# Optionally upload report\nurl = upload_local_file('/tmp/invoice_report.csv')\nprint(f'Report: {url}')"
   })
```

---

## Inactive / available but NOT connected

These toolkits exist in Composio but have **no active connection**. If the user wants to use one, call `COMPOSIO_MANAGE_CONNECTIONS` with `action: "add"` and the toolkit `name`, show the returned `redirect_url` as a markdown link, then poll with `COMPOSIO_WAIT_FOR_CONNECTIONS`.

| Toolkit | What it does |
|---|---|
| `googlecalendar` | Standalone Google Calendar (prefer `googlesuper` instead) |
| `slack` | Channel messaging, search, admin |
| `linear` | Issue tracking, projects, teams |
| `hubspot` | CRM, marketing emails, contacts |
| `zoho` | CRM, email, suite |
| `vercel` | Frontend deployments, projects |
| `openai` | GPT models, image gen, assistants |
| `twitter` | X posts, media, polls |
| `typefully` | Twitter thread drafting/scheduling |
| `finerworks` | Fine art print inventory |
| `mailerlite` | Email marketing |
| `webflow` | Website builder, e-commerce orders |
| `github` | Repos, issues, PRs, commits |
| `gitlab` | Repos, merge requests, CI |
| `bitbucket` | Repos, pull requests |
| `jira` | Issue tracking, sprints, boards |
| `trello` | Boards, cards, lists |
| `asana` | Projects, tasks, sections |
| `clickup` | Tasks, docs, lists |
| `airtable` | Bases, tables, records |
| `stripe` | Payments, customers, subscriptions |
| `shopify` | Store, products, orders |
| `zoom` | Meetings, recordings |
| `whatsapp` | Send messages via WhatsApp Business |
| `telegram` | Send messages to chats/channels |
| `intercom` | Customer messaging, tickets |
| `zendesk` | Support tickets, views |
| `mailchimp` | Email campaigns, audiences |
| `sendgrid` | Transactional email |
| `brevo` | Email + SMS marketing |
| `pipedrive` | CRM deals, activities |
| `salesforce` | CRM records, opportunities |
| `dropbox` | File storage, sharing |
| `box` | Enterprise file storage |
| `onedrive` | Microsoft file storage |
| `spotify` | Playlists, tracks, search |
| `calendly` | Scheduling links |
| `calcom` | Open-source scheduling |
| `stripe` | Payments, checkout, billing |
| `docker` | Container management |
| `kubernetes` | Cluster management |
| `s3` / `aws_*` | AWS storage and services |
| `firebase` | Firestore, auth (via `google_analytics` firebase links) |
| `mongodb` | Database queries |
| `redis` | Cache operations |
| `posthog` | Product analytics |
| `mixpanel` | Event analytics |
| `intercom` | Customer support messaging |

Composio supports **1400+ toolkits** total. For anything not listed above, call `COMPOSIO_SEARCH_TOOLS` with a use-case description — it will return the matching toolkit slug and connection status.

---

## Routing quick-reference

| User says... | Use toolkit | First tool to call |
|---|---|---|
| "send email", "email someone", "draft email" | `gmail` | `GMAIL_CREATE_EMAIL_DRAFT` or `GMAIL_SEND_EMAIL` |
| "search my inbox", "find email from X" | `gmail` | `GMAIL_SEARCH_EMAILS` / `GMAIL_FETCH_EMAILS` |
| "save to notion", "create notion page", "notion database" | `notion` | `NOTION_SEARCH_NOTION_PAGE` then `NOTION_CREATE_DATABASE_PAGE` |
| "find a file", "google drive", "download doc" | `googlesuper` | `GOOGLESUPER_FIND_FILE` |
| "schedule meeting", "create calendar event", "google meet" | `googlesuper` | `GOOGLESUPER_CREATE_EVENT` or `GOOGLESUPER_CREATE_MEET` |
| "find free time", "check calendar" | `googlesuper` | `GOOGLESUPER_FIND_FREE_SLOTS` |
| "post to reddit", "reddit post" | `reddit` | `REDDIT_CREATE_REDDIT_POST` |
| "post on linkedin", "linkedin article" | `linkedin` | `LINKEDIN_CREATE_LINKED_IN_POST` (pick account) |
| "generate image", "AI image", "veo video" | `gemini` | `GEMINI_GENERATE_IMAGE` / `GEMINI_GENERATE_VIDEO` |
| "send discord message", "discord channel" | `discord` | `DISCORD_SEND_MESSAGE` |
| "youtube comment", "find youtube channel", "list my videos" | `youtube` | `YOUTUBE_POST_COMMENT` / `YOUTUBE_LIST_CHANNELS` |
| "connect slack/github/hubspot/etc" | (inactive) | `COMPOSIO_MANAGE_CONNECTIONS` with `action: "add"` |
| "upload image to cloudinary", "cdn image" | `cloudinary` (inactive) | `COMPOSIO_MANAGE_CONNECTIONS` then `CLOUDINARY_UPLOAD_ASSET` |
| "supabase query", "run sql on supabase" | `supabase` (inactive) | `COMPOSIO_MANAGE_CONNECTIONS` then `SUPABASE_RUN_READ_ONLY_QUERY` |
| "download from google drive", "drive file" | `googledrive` / `googlesuper` | `GOOGLEDRIVE_DOWNLOAD_FILE` / `GOOGLESUPER_DOWNLOAD_FILE` |
| "google analytics", "ga4 traffic" | `google_analytics` | `GOOGLE_ANALYTICS_LIST_PROPERTIES_FILTERED` |
| "run python", "process data", "transform results" | (meta) | `COMPOSIO_REMOTE_WORKBENCH` |
| "run bash command" | (meta) | `COMPOSIO_REMOTE_BASH_TOOL` |
| "plan a multi-step workflow" | (meta) | `COMPOSIO_CREATE_PLAN` after `SEARCH_TOOLS` |

---

## Execution rules

1. **Never invent tool slugs or argument fields.** Always get them from `COMPOSIO_SEARCH_TOOLS` or `COMPOSIO_GET_TOOL_SCHEMAS`.
2. **Never execute a tool on an inactive toolkit.** Initiate connection first via `COMPOSIO_MANAGE_CONNECTIONS`, show the auth link, then poll with `COMPOSIO_WAIT_FOR_CONNECTIONS`.
3. **For multi-account toolkits** (`linkedin`, `youtube`), always pass the `account` field with the account ID or alias. Ask the user which account if ambiguous.
4. **Batch independent calls** via `COMPOSIO_MULTI_EXECUTE_TOOL` (up to 50). Never chain outputs within a single multi-execute call — resolve inputs first with separate calls.
5. **Confirm before destructive/public actions** — posting to Reddit/LinkedIn/Discord/YouTube, sending emails, deleting files/events. These are real-world side effects.
6. **Pass `session_id`** through every meta call in a workflow. Use `{generate_id: true}` for the first call; reuse the returned `id` for subsequent calls. Generate a new one when the user pivots to a new task.
7. **Show source links inline** in markdown next to relevant text (Slack threads, doc URLs, post permalinks) — never raw IDs.
8. **Use `COMPOSIO_CREATE_PLAN`** for medium/hard tasks (multi-tool, conditional logic, bulk ops). Skip for easy single-tool tasks.
9. **Use `COMPOSIO_REMOTE_WORKBENCH`** when responses are large, need transformation, or involve multi-step logic. Set `sync_response_to_workbench: true` on the preceding `MULTI_EXECUTE_TOOL` call.
10. **Honor rate limits** — watch `X-RateLimit-Remaining`, honor `Retry-After` on `429`, cache static data, batch calls.
11. **Sandbox 180s limit** — break large Python/bash tasks into smaller cells. State persists across cells in the same session.
12. **Pagination** — check responses for `next_cursor` / `nextPageToken` / `pageToken` and continue fetching until complete. Incomplete pagination silently drops results.
