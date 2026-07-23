---
name: ai-and-hostinger
description: How to properly use OpenAI API, OpenRouter, and Hostinger (hosting, DNS, domains, billing, reach) via MCP. Covers exact tool names, argument schemas, model selection, image generation + saving workflows, video generation, and deployment. Invoke when the user says "openai", "open router", "openrouter", "call openai", "generate image openai", "save image", "gpt-4", "dall-e", "hostinger", "deploy website", "deploy wordpress", "dns records", "buy domain", "hostinger hosting", "hostinger billing", "hostinger reach", "veo video", "gemini image", "rerank documents", or any task involving AI model calls or Hostinger infrastructure.
---

# OpenAI API, OpenRouter & Hostinger — Usage Skill

This skill documents how to properly call **OpenAI** (via Composio or OpenRouter), **OpenRouter** (MCP server, ready to use), and **Hostinger** (5 MCP servers, ready to use). Includes exact tool names, argument schemas, model selection, image generation + saving workflows, and deployment.

---

## Table of contents

1. [Three ways to call OpenAI models](#three-ways-to-call-openai-models)
2. [OpenRouter MCP server (ready to use)](#openrouter-mcp-server-ready-to-use)
3. [OpenAI via Composio (needs connection)](#openai-via-composio-needs-connection)
4. [Image generation + saving — full workflows](#image-generation--saving--full-workflows)
5. [Video generation workflows](#video-generation-workflows)
6. [OpenRouter image generation → Cloudinary upload (PROPER way)](#openrouter-image-generation--cloudinary-upload-proper-way)
7. [Social media scheduling — post to all platforms](#social-media-scheduling--post-to-all-platforms)
8. [Hostinger MCP servers (5 servers, ready to use)](#hostinger-mcp-servers-5-servers-ready-to-use)
9. [Routing quick-reference](#routing-quick-reference)
10. [Limits & best practices](#limits--best-practices)

---

## Three ways to call OpenAI models

| Method | Status | When to use |
|---|---|---|
| **OpenRouter MCP** (`openrouter` server) | Ready to use | Default choice — access OpenAI + Anthropic + Google + Meta + Mistral via one API. Supports `:nitro`/`:floor`/`:exacto` suffixes, web search, caching, reasoning tokens |
| **OpenAI via Composio** (`openai` toolkit) | NOT connected — needs `COMPOSIO_MANAGE_CONNECTIONS` | When you need direct OpenAI API features (Assistants, Threads, Files, fine-tunes) not exposed by OpenRouter |
| **Direct OpenAI API** (via `exec` + `curl`/Python) | Needs `OPENAI_API_KEY` env var | When MCP/Composio unavailable and you have an API key in the environment |

**Prefer OpenRouter MCP** for chat/image/audio/video generation — it's already connected, supports model routing, and exposes 400+ models including all OpenAI models.

---

## OpenRouter MCP server (ready to use)

Server name: `openrouter`. Call tools via `mcp_call_tool` with `server_name: "openrouter"`.

### Tool catalog (14 tools)

| Tool | What it does | Required args |
|---|---|---|
| `chat_completion` | Text generation, Q&A, summarization, multi-turn dialogue | `messages` (array of `{role, content}`) |
| `analyze_image` | OCR, captioning, visual Q&A on one image | `image_path` (local path, https URL, or data URL) |
| `analyze_audio` | Transcribe or analyze one audio file | `audio_path` (local path, URL, or data URL) |
| `analyze_video` | Describe/analyze one video file (mp4/mpeg/mov/webm) | `video_path` |
| `generate_image` | Generate image from text prompt (default: `google/gemini-2.5-flash-image`) | `prompt` |
| `generate_audio` | TTS or music from text prompt | `prompt` |
| `generate_video` | Text-to-video (default: `google/veo-3.1`); async, polls until `max_wait_ms` | `prompt` |
| `generate_video_from_image` | Image-to-video (one image + motion prompt) | `image`, `prompt` |
| `get_video_status` | Poll async video job by `video_id` | `video_id` |
| `search_models` | Search model catalog by name/provider/capability | `query` or `provider` or `capabilities` |
| `get_model_info` | Pricing, context length, modalities for one model | `model` (full slug like `openai/gpt-4o`) |
| `validate_model` | Boolean check: does model id exist? | `model` |
| `rerank_documents` | Re-order documents by relevance to a query | `query`, `documents` (array of strings) |
| `health_check` | Verify API key + reachability + cached model count | (no args) |

### `chat_completion` — full argument schema

| Parameter | Type | Required | Description |
|---|---|---|---|
| `messages` | array | Yes | Min 1 item: `{role: "system"\|"user"\|"assistant", content: string \| array}` |
| `model` | string | No | Model ID. Append `:nitro` (fastest), `:floor` (cheapest), `:exacto` (best tool-calling). E.g. `openai/gpt-4o:nitro` |
| `temperature` | number | No | 0-2 |
| `max_tokens` | number | No | Max completion tokens. Falls back to `OPENROUTER_MAX_TOKENS` env var |
| `provider` | object | No | Routing overrides: `quantizations`, `ignore`, `sort` (`price`\|`throughput`\|`latency`), `order`, `require_parameters`, `data_collection` (`allow`\|`deny`), `allow_fallbacks` |
| `include_reasoning` | boolean | No | Surface chain-of-thought on `_meta.reasoning` for R1 / Opus 4.7 / Gemini Thinking |
| `online` | boolean | No | Enable web-search plugin (Exa-backed, $4 / 1000 results) |
| `web_max_results` | number | No | Max web results when `online: true` (default 5) |
| `cache` | boolean | No | Enable response caching via `X-OpenRouter-Cache: true` |
| `cache_ttl` | string | No | Cache TTL (`"5m"`, `"1h"`, `"24h"`; 1s-24h) |
| `cache_clear` | boolean | No | Bust cache entry for this exact request |

### Common model slugs (OpenRouter)

| Use case | Model slug | Notes |
|---|---|---|
| Fastest OpenAI | `openai/gpt-4o:nitro` | Nitro = fastest variant |
| Cheapest OpenAI | `openai/gpt-4o-mini:floor` | Floor = cheapest |
| Best tool-calling | `openai/gpt-4o:exacto` | Exacto = best tool accuracy |
| Anthropic Claude | `anthropic/claude-sonnet-4` | Vision + reasoning |
| Google Gemini | `google/gemini-2.5-flash` | Fast, multimodal |
| Gemini Thinking | `google/gemini-2.5-flash` + `include_reasoning: true` | Chain-of-thought |
| Meta Llama | `meta-llama/llama-3.3-70b-instruct` | Open weights |
| Mistral | `mistralai/mistral-large` | European |
| R1 reasoning | `deepseek/deepseek-r1` + `include_reasoning: true` | Reasoning model |
| Image gen | `google/gemini-2.5-flash-image` | Default for `generate_image` |
| Video gen | `google/veo-3.1` | Default for `generate_video` |
| Rerank | `cohere/rerank-english-v3.0` | Default for `rerank_documents` |

### Example: basic chat completion

```
mcp_call_tool({
  server_name: "openrouter",
  tool_name: "chat_completion",
  arguments: {
    model: "openai/gpt-4o",
    messages: [
      { role: "system", content: "You are a concise assistant." },
      { role: "user", content: "Explain recursion in one paragraph." }
    ],
    temperature: 0.7,
    max_tokens: 300
  }
})
```

### Example: web-grounded answer

```
mcp_call_tool({
  server_name: "openrouter",
  tool_name: "chat_completion",
  arguments: {
    model: "openai/gpt-4o:nitro",
    messages: [{ role: "user", content: "What's the latest news on AI regulation in the EU?" }],
    online: true,
    web_max_results: 5
  }
})
```

### Example: search models by capability

```
mcp_call_tool({
  server_name: "openrouter",
  tool_name: "search_models",
  arguments: { query: "gemini", capabilities: { vision: true }, limit: 10, offset: 0 }
})
```

### Error codes (OpenRouter)

| Code | Meaning |
|---|---|
| `INVALID_INPUT` | Empty messages array, missing required field, wrong key name |
| `UNSAFE_PATH` | Local path escaped the input sandbox |
| `RESOURCE_TOO_LARGE` | Image/audio/video exceeded fetch size cap |
| `UPSTREAM_REFUSED` | Credits, content policy, rate limit, SSRF block |
| `UPSTREAM_TIMEOUT` | Upstream did not respond in time |
| `MODEL_NOT_FOUND` | Model slug does not exist on OpenRouter |
| `JOB_STILL_RUNNING` | Video job still processing (not an error — resume with `get_video_status`) |
| `JOB_FAILED` | Provider marked video job failed |
| `UNSUPPORTED_FORMAT` | File not recognized as audio/video |

---

## OpenAI via Composio (needs connection)

The `openai` toolkit in Composio is **NOT connected**. To use it:

```
1. COMPOSIO_MANAGE_CONNECTIONS({ toolkits: [{ name: "openai", action: "add" }] })
   → Show redirect_url as markdown link to user
2. COMPOSIO_WAIT_FOR_CONNECTIONS({ toolkits: ["openai"] })
   → Poll until ACTIVE
3. COMPOSIO_SEARCH_TOOLS({ queries: [{ use_case: "openai image generation" }] })
4. COMPOSIO_MULTI_EXECUTE_TOOL({ tools: [{ tool_slug: "OPENAI_CREATE_IMAGE", arguments: {...} }] })
```

### Key OpenAI tool slugs (Composio)

| Slug | What it does | Key args |
|---|---|---|
| `OPENAI_CREATE_IMAGE` | Generate image from text | `model` (`gpt-image-2`, `gpt-image-1`, `dall-e-3`), `prompt`, `size`, `quality`, `n`, `output_format` (`png`\|`jpeg`\|`webp`), `background` |
| `OPENAI_CREATE_IMAGE_EDIT` | Edit/extend existing image | `prompt`, `image`, `mask` (optional) |
| `OPENAI_CREATE_RESPONSE` | One-shot Responses API (multimodal) | `model`, `input` |
| `OPENAI_LIST_MODELS` | List available models | (no args) |
| `OPENAI_RETRIEVE_MODEL` | Get model metadata | `model` |
| `OPENAI_CREATE_ASSISTANT` | Create an Assistant | `model`, `name`, `instructions` |
| `OPENAI_UPLOAD_FILE` | Upload a file | `file`, `purpose` |

### OpenAI image generation — argument details

| Parameter | Type | Description |
|---|---|---|
| `model` | string | `gpt-image-2` (newest), `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`, `chatgpt-image-latest`, `dall-e-3`, `dall-e-2`. DALL-E 2/3 deprecated 05/12/2026 |
| `prompt` | string | Max 32000 chars (GPT image), 4000 (dall-e-3), 1000 (dall-e-2) |
| `n` | integer | 1-10. For dall-e-3 only n=1 |
| `size` | string | `1024x1024`, `1536x1024`, `1024x1536`, `auto`, or any WxH where both edges are multiples of 16, max 3840px (gpt-image-2) |
| `quality` | string | `standard`, `hd`, `auto`, `high`, `medium`, `low` |
| `style` | string | `vivid` \| `natural` (dall-e-3 only) |
| `output_format` | string | `png`, `jpeg`, `webp` (gpt-image-2 and gpt-image-1 series) |
| `output_compression` | integer | 0-100 (jpeg/webp only) |
| `background` | string | `transparent`, `opaque`, `auto` (gpt-image models; gpt-image-2 does NOT support `transparent`) |
| `moderation` | string | `auto` (default), `low` (gpt-image-2 and gpt-image-1 series) |

### Pitfalls (OpenAI via Composio)

- HTTP 403 `model_not_found` = access-gating; HTTP 400 `billing_hard_limit_reached` = billing blocked
- `images[].asset_url` is a **short-lived signed link** — download/store immediately
- Some environments error if an unrecognized account selector is provided — omit `account` field or use a valid identifier

---

## Image generation + saving — full workflows

### Workflow A — Generate image with OpenRouter, save to disk

```
1. mcp_call_tool({
     server_name: "openrouter",
     tool_name: "generate_image",
     arguments: {
       prompt: "A watercolor fox in autumn leaves, soft lighting",
       aspect_ratio: "16:9",
       save_path: "out/fox.png"
     }
   })
   → Image saved to output sandbox at out/fox.png
   → Response includes _meta with image URL/path
```

### Workflow B — Generate image with OpenRouter, upload to Cloudinary via Composio

```
1. mcp_call_tool({
     server_name: "openrouter",
     tool_name: "generate_image",
     arguments: { prompt: "A serene mountain landscape at sunset", save_path: "out/sunset.png" }
   })

2. COMPOSIO_MANAGE_CONNECTIONS({ toolkits: [{ name: "cloudinary", action: "add" }] })
   → Show auth link, poll with COMPOSIO_WAIT_FOR_CONNECTIONS

3. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "CLOUDINARY_UPLOAD_ASSET",
       arguments: {
         file_url: "<https URL of generated image from step 1>",
         public_id: "sunset-landscape",
         folder: "ai-generated"
       }
     }]
   })
   → Returns data.public_id and data.secure_url — persist these
```

### Workflow C — Generate image with OpenAI (Composio), save to Google Drive

```
1. COMPOSIO_MANAGE_CONNECTIONS({ toolkits: [{ name: "openai", action: "add" }] })
   → Auth, poll until ACTIVE

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "OPENAI_CREATE_IMAGE",
       arguments: {
         model: "gpt-image-2",
         prompt: "A futuristic cityscape with neon lights",
         size: "1024x1024",
         quality: "high",
         output_format: "png",
         n: 1
       }
     }],
     sync_response_to_workbench: true
   })
   → Extract images[0].asset_url (short-lived signed URL)

3. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "GOOGLESUPER_UPLOAD_FILE",
       arguments: {
         name: "cityscape.png",
         mimetype: "image/png",
         s3key: "<s3key from image response>"
       }
     }]
   })
   → File saved to Google Drive
```

### Workflow D — Generate image with Gemini (Composio, no auth needed), save to Notion

```
1. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "GEMINI_GENERATE_IMAGE",
       arguments: { prompt: "A minimalist logo for a tech startup" }
     }],
     sync_response_to_workbench: true
   })
   → Extract data.image.s3url

2. COMPOSIO_MULTI_EXECUTE_TOOL({
     tools: [{
       tool_slug: "NOTION_CREATE_DATABASE_PAGE",
       arguments: {
         database_id: "<target database>",
         properties: { Name: { title: [{ text: { content: "Startup logo" } }] } },
         children: [{
           type: "image",
           image: { external: { url: "<s3url from step 1>" } }
         }]
       }
     }]
   })
```

### Workflow E — Generate image, then analyze it (vision Q&A)

```
1. mcp_call_tool({
     server_name: "openrouter",
     tool_name: "generate_image",
     arguments: { prompt: "An infographic about climate change", save_path: "out/infographic.png" }
   })

2. mcp_call_tool({
     server_name: "openrouter",
     tool_name: "analyze_image",
     arguments: {
       image_path: "out/infographic.png",
       question: "List every statistic shown in this infographic.",
       model: "google/gemini-2.5-flash",
       cache_input: true
     }
   })
   → cache_input: true attaches cache_control:ephemeral — repeat questions about same image save ~10x on Anthropic
```

### Workflow F — Generate image with reference (style/identity consistency)

```
mcp_call_tool({
  server_name: "openrouter",
  tool_name: "generate_image",
  arguments: {
    prompt: "Same character as reference, now running through a field",
    input_images: ["ref.png"],
    aspect_ratio: "16:9",
    save_path: "out/character-running.png"
  }
})
```

---

## Video generation workflows

### Workflow G — Text-to-video (async, poll until done)

```
1. mcp_call_tool({
     server_name: "openrouter",
     tool_name: "generate_video",
     arguments: {
       prompt: "Ocean waves at sunset, cinematic",
       save_path: "out/ocean.mp4"
     }
   })
   → If _meta.code == "JOB_STILL_RUNNING": capture _meta.video_id
   → If complete: video saved to out/ocean.mp4

2. (If still running) mcp_call_tool({
     server_name: "openrouter",
     tool_name: "get_video_status",
     arguments: { video_id: "<from step 1>", save_path: "out/ocean.mp4" }
   })
   → Repeat until status completes
```

### Workflow H — Image-to-video

```
mcp_call_tool({
  server_name: "openrouter",
  tool_name: "generate_video_from_image",
  arguments: {
    image: "start.png",
    prompt: "Camera slowly zooms in, subject begins to smile",
    save_path: "out/zoom.mp4"
  }
})
```

### Workflow I — Video with first + last frame

```
mcp_call_tool({
  server_name: "openrouter",
  tool_name: "generate_video",
  arguments: {
    prompt: "Morph from day to night",
    first_frame_image: "day.png",
    last_frame_image: "night.png",
    save_path: "out/morph.mp4"
  }
})
```

---

## OpenRouter image generation → Cloudinary upload (PROPER way)

There are **two paths** to generate an image and store it in Cloudinary. Path A (Gemini) is simpler and free. Path B (OpenRouter) is the requested model but requires an extra step because OpenRouter returns base64, not a public URL.

### Path A — Gemini → Cloudinary (RECOMMENDED, free, 2 steps)

Gemini returns a public `s3url` that Cloudinary can fetch directly via `file_url`.

```
Step 1: Generate image via Gemini (returns public s3url)
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "GEMINI_GENERATE_IMAGE",
    arguments: {
      prompt: "<your image prompt>",
      model: "gemini-2.5-flash-image",     // GA stable, fast
      aspect_ratio: "1:1"                   // or 4:5, 16:9, 9:16
    }
  }],
  sync_response_to_workbench: false
})
→ Extract: data.image.s3url  (public URL, valid 1 hour)
→ Extract: data.image.mimetype  (e.g. "image/png")

Step 2: Upload to Cloudinary using file_url
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "CLOUDINARY_UPLOAD_ASSET",
    account: "cloudinary_encode-zoism",
    arguments: {
      file_url: "<s3url from step 1>",
      public_id: "social-posts/<topic-slug>-<date>",
      folder: "social-posts",
      resource_type: "image",
      overwrite: false,
      tags: "social,ai-generated,codemypixel"
    }
  }]
})
→ Extract: data.secure_url  (permanent Cloudinary CDN URL)
→ Extract: data.public_id  (for later management/deletion)
→ Extract: data.bytes, data.width, data.height
```

**Why this works:** Cloudinary's `file_url` parameter fetches the image from any public URL. Gemini's `s3url` is publicly accessible for 1 hour — plenty of time for Cloudinary to fetch and store it permanently.

### Path B — OpenRouter → Cloudinary (requires workbench extraction, 3 steps)

OpenRouter returns images as base64 data URLs inside `choices[0].message.images[0].image_url.url`. Cloudinary's Composio tool does NOT accept data URLs as `file_url`. You must extract the base64, save it to the sandbox, then use the workbench to upload via Cloudinary's REST API. **This is more complex and costs OpenRouter credits.**

```
Step 1: Generate image via OpenRouter (returns base64 data URL)
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "OPENROUTER_CREATE_CHAT_COMPLETION",
    account: "openrouter_humped-dimps",
    arguments: {
      model: "google/gemini-3.1-flash-lite-image",
      messages: [{ role: "user", content: "Generate an image: <your prompt>" }],
      max_tokens: 8000          // keep low to stay within credit budget
    }
  }],
  sync_response_to_workbench: true   // saves full response to sandbox
})
→ Image is at: choices[0].message.images[0].image_url.url
→ It's a data:image/jpeg;base64,... string (NOT a public URL)
→ Response saved to sandbox at /mnt/files/mex/<filename>.json

Step 2: Extract base64 image and save to sandbox file
COMPOSIO_REMOTE_WORKBENCH({
  code_to_execute: `
    import json, base64
    file_data = json.load(open('/mnt/files/mex/<filename>.json'))
    result_data = file_data['results'][0]['response']['data']
    url = result_data['choices'][0]['message']['images'][0]['image_url']['url']
    header, b64data = url.split(',', 1)
    img_bytes = base64.b64decode(b64data)
    with open('/mnt/files/mex/image.jpg', 'wb') as f:
        f.write(img_bytes)
    print(f'Image saved: {len(img_bytes)} bytes')
  `
})

Step 3: Upload to Cloudinary via REST API (signed upload)
COMPOSIO_REMOTE_WORKBENCH({
  code_to_execute: `
    import requests
    with open('/mnt/files/mex/image.jpg', 'rb') as f:
        img_bytes = f.read()
    cloud_name = 'dqvyz2ee'
    upload_url = f'https://api.cloudinary.com/v1_1/{cloud_name}/image/upload'
    files = {'file': ('image.jpg', img_bytes, 'image/jpeg')}
    data = {'public_id': 'social-posts/<topic-slug>-<date>', 'folder': 'social-posts'}
    resp = requests.post(upload_url, files=files, data=data, timeout=60)
    print(f'Status: {resp.status_code}')
    print(f'Response: {resp.json()}')
  `
})
→ NOTE: This will FAIL with "Upload preset must be specified" because
  Cloudinary requires either a signature (API key + secret) or an upload
  preset for unsigned uploads. The Composio CLOUDINARY_UPLOAD_ASSET tool
  handles signing internally, but it only accepts file_url (public URL)
  or file (s3key object), NOT raw bytes or data URLs.
```

**Path B limitation:** The Composio `CLOUDINARY_UPLOAD_ASSET` tool cannot upload base64/data URLs directly. It needs either:
- `file_url`: a publicly accessible HTTPS URL (Gemini s3url works, OpenRouter base64 does NOT)
- `file`: an object with `{name, mimetype, s3key}` where s3key is a Composio internal S3 reference from a prior download action

**Bottom line: Use Path A (Gemini → Cloudinary) for the image generation + storage flow. It's free, simpler, and works end-to-end in 2 steps. Only use OpenRouter if you specifically need the `gemini-3.1-flash-lite-image` model and are willing to handle the base64 extraction complexity.**

### Cloudinary account reference

| Account ID | Status | Cloud name | Notes |
|---|---|---|---|
| `cloudinary_encode-zoism` | Active (default) | `dqvyz2ee` | Reconnected 2026-07-19. Use this account. |
| `cloudinary_foul-imban` | Old (invalid key) | — | 401 "unknown api_key". Do NOT use. |
| `cloudinary_tice-serum` | Initiated (incomplete) | — | Auth not completed. Do NOT use. |

### Cloudinary upload response fields (persist these)

| Field | Description | Example |
|---|---|---|
| `secure_url` | Permanent CDN URL for the image | `https://res.cloudinary.com/dqvyz2ee/image/upload/v123/social-posts/my-image.png` |
| `public_id` | Unique identifier for management/deletion | `social-posts/my-image` |
| `bytes` | File size in bytes | `1015202` |
| `width` / `height` | Dimensions in pixels | `1024` / `1024` |
| `format` | Image format | `png` |
| `etag` | MD5 hash of the file | `aa90fb3129da...` |
| `asset_id` | Cloudinary internal asset ID | `b230d3c13c70...` |

### OpenRouter account reference

| Account ID | Status | Credits | Notes |
|---|---|---|---|
| `openrouter_humped-dimps` | Active (default) | ~5.42 remaining (15 total) | Connected 2026-07-19. Image gen costs ~$0.034 per image. |

### OpenRouter image generation — key details

| Field | Value |
|---|---|
| Model slug | `google/gemini-3.1-flash-lite-image` |
| Required args | `model`, `messages` (array with 1 user message containing the prompt) |
| Image location in response | `choices[0].message.images[0].image_url.url` |
| Image format | base64 data URL (`data:image/jpeg;base64,...`) |
| Cost per image | ~$0.034 (1120 image tokens) |
| `max_tokens` recommendation | 8000 (keep low to preserve credits) |
| `content` field | Will be `null` for image outputs — check `images` array instead |

### Gemini image generation — key details

| Field | Value |
|---|---|
| Tool slug | `GEMINI_GENERATE_IMAGE` |
| Auth needed | None (free tier, no connection required) |
| Models | `gemini-2.5-flash-image` (GA stable, recommended), `gemini-3-pro-image-preview` (4K, thinking mode), `gemini-2.0-flash-exp-image-generation` (experimental) |
| Required args | `prompt` |
| Image location in response | `data.image.s3url` (public URL, valid 1 hour) |
| Image format | PNG or JPEG (specified by mimetype in response) |
| Cost | Free |
| Aspect ratios | `1:1`, `4:5`, `16:9`, `9:16` (not supported by 2.0-flash-exp model) |
| Resolution | `1K` (default), `2K`, `4K` (only for gemini-3-pro-image-preview) |
| Concurrency limit | ≤3 concurrent calls (HTTP 429 if exceeded) |

---

## Social media scheduling — post to all platforms

### Platform scheduling capabilities

| Platform | Native scheduling? | How | Min future time | Max future time |
|---|---|---|---|---|
| **Facebook** | YES | `FACEBOOK_CREATE_PHOTO_POST` with `published: false` + `scheduled_publish_time` (Unix UTC epoch) | 10 minutes | 6 months |
| **LinkedIn** | DRAFT only | `LINKEDIN_CREATE_LINKED_IN_POST` with `lifecycleState: "DRAFT"` | N/A (no native scheduling) | N/A |
| **Reddit** | NO | No scheduling API — post immediately or use external scheduler | N/A | N/A |

### Facebook scheduling — full workflow

```
Step 1: Calculate scheduled_publish_time
  → Unix UTC epoch timestamp, at least 10 minutes in the future
  → Example: 2026-07-20 09:00 AM UTC = 1784563200

Step 2: Create scheduled photo post
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "FACEBOOK_CREATE_PHOTO_POST",
    account: "facebook_chaff-embog",
    arguments: {
      page_id: "106777042355587",           // Codemypixel page
      message: "<Facebook caption>",
      url: "<Cloudinary secure_url>",        // public image URL
      published: false,                      // MUST be false for scheduling
      scheduled_publish_time: 1784563200     // Unix UTC epoch
    }
  }]
})
→ Returns: { id: "<post_id>", post_id: "<pageId>_<postId>" }
→ Post is now scheduled, not published

Step 3 (optional): List scheduled posts
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "FACEBOOK_GET_SCHEDULED_POSTS",
    account: "facebook_chaff-embog",
    arguments: { page_id: "106777042355587" }
  }]
})

Step 4 (optional): Reschedule a scheduled post
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "FACEBOOK_RESCHEDULE_POST",
    account: "facebook_chaff-embog",
    arguments: {
      post_id: "<pageId_postId from step 2>",
      scheduled_publish_time: <new Unix UTC epoch>   // 10 min to 6 months ahead
    }
  }]
})

Step 5 (optional): Publish a scheduled post immediately
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "FACEBOOK_PUBLISH_SCHEDULED_POST",
    account: "facebook_chaff-embog",
    arguments: {
      post_id: "<pageId_postId from step 2>"
    }
  }]
})
```

**Pitfalls:**
- `published: true` + `scheduled_publish_time` together → 400 validation error
- `scheduled_publish_time` must be Unix UTC epoch (not local time, not ISO string)
- Must be at least 10 minutes in the future, no more than 6 months ahead
- `post_id` format is `pageId_postId` (composite) — use the full composite, not just the photo ID

### LinkedIn posting — with image (full workflow)

LinkedIn does NOT support native scheduling. You can either:
1. **Publish immediately** (`lifecycleState: "PUBLISHED"`)
2. **Save as draft** (`lifecycleState: "DRAFT"`) — then manually publish later from LinkedIn.com

```
Step 1: Get author URN (if not already known)
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "LINKEDIN_GET_MY_INFO",
    account: "linkedin_cuir-talcer",     // personal
    arguments: {}
  }]
})
→ Extract: data.id → build URN: "urn:li:person:<id>"
→ For company: use account "linkedin_neckar-scraw" and author "urn:li:organization:<org_id>"

Step 2: Register image upload (get upload URL + asset URN)
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "LINKEDIN_REGISTER_IMAGE_UPLOAD",
    account: "linkedin_cuir-talcer",
    arguments: {
      owner_urn: "urn:li:person:7oSMMKtrp_",
      recipe: "urn:li:digitalmediaRecipe:feedshare-image"
    }
  }]
})
→ Extract: upload URL + asset URN (the digital media asset reference)

Step 3: Upload image binary to the presigned URL
→ Use COMPOSIO_REMOTE_WORKBENCH to PUT the image bytes to the upload URL
→ Image must be accessible (use Cloudinary secure_url or Gemini s3url)

Step 4: Create the post with the uploaded image
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "LINKEDIN_CREATE_LINKED_IN_POST",
    account: "linkedin_cuir-talcer",
    arguments: {
      author: "urn:li:person:7oSMMKtrp_",
      commentary: "<LinkedIn caption>",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED",        // or "DRAFT" to save without publishing
      images: [{
        name: "post-image.png",
        mimetype: "image/png",
        s3key: "<s3key from a prior Composio download/upload action>"
      }]
    }
  }]
})
→ Returns: { x_restli_id: "urn:li:share:<id>" }
→ Post URL: https://www.linkedin.com/feed/update/<x_restli_id>
```

**Alternative (simpler) — text-only LinkedIn post (no image):**
```
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "LINKEDIN_CREATE_LINKED_IN_POST",
    account: "linkedin_cuir-talcer",     // or "linkedin_neckar-scraw" for company
    arguments: {
      author: "urn:li:person:7oSMMKtrp_",
      commentary: "<LinkedIn caption>",
      visibility: "PUBLIC",
      lifecycleState: "PUBLISHED"
    }
  }]
})
```

**Pitfalls:**
- Posting the same content to personal AND company in the same call → 422 DUPLICATE_POST error. Tweak the caption slightly for each account.
- `images` array items need `{name, mimetype, s3key}` — you can't pass a URL directly. The s3key comes from a prior Composio file download/upload action.
- For company posts, use account `linkedin_neckar-scraw` and author `urn:li:organization:<org_id>` (not person URN).
- `lifecycleState: "DRAFT"` saves to LinkedIn drafts (accessible at linkedin.com/post-or-share) — no native scheduling.
- `commentary` max length: 3000 characters.

### Reddit posting — full workflow

Reddit has NO scheduling API. Posts are published immediately.

```
Step 1 (optional): Search for the right subreddit
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "REDDIT_GET_SUBREDDITS_SEARCH",
    account: "reddit_elod-coater",
    arguments: { q: "smallbusiness" }    // NOTE: field is "q", NOT "query"
  }]
})

Step 2 (optional): Check subreddit rules
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "REDDIT_GET_SUBREDDIT_RULES",
    account: "reddit_elod-coater",
    arguments: { subreddit: "smallbusiness" }
  }]
})

Step 3 (optional): List available post flairs
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "REDDIT_LIST_SUBREDDIT_POST_FLAIRS",
    account: "reddit_elod-coater",
    arguments: { subreddit: "smallbusiness" }
  }]
})

Step 4: Create the post
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "REDDIT_CREATE_REDDIT_POST",
    account: "reddit_elod-coater",
    arguments: {
      subreddit: "smallbusiness",
      title: "<post title, max 300 chars>",
      kind: "self",                     // "self" for text post, "link" for URL post
      text: "<markdown body text>",     // required if kind="self", max ~40000 chars
      // url: "<https URL>",            // required if kind="link"
      // flair_id: "<flair UUID>"       // optional, from step 3
    }
  }]
})
→ Check: response.data.success === true
→ Extract: response.data.id, response.data.name, response.data.url
→ If success=false: inspect response.data.validation_error and fix (do NOT retry blindly)
```

**Pitfalls:**
- Field is `q` for search, NOT `query` (common mistake)
- `kind: "self"` = text post (needs `text`), `kind: "link"` = link post (needs `url`)
- Reddit self posts are text-only — you CANNOT attach images via the API. Include the image URL inside the `text` body instead.
- Title max 300 chars, body max ~40000 chars
- `success: false` with `validation_error` like `FLAIR_REQUIRED`, `BODY_NOT_ALLOWED`, `SUBREDDIT_NOTALLOWED` → fix the specific issue, don't loop
- Some subreddits require flair — get the `flair_id` from `REDDIT_LIST_SUBREDDIT_POST_FLAIRS` first
- 429 rate limiting — don't post to multiple subreddits in rapid succession

### Full multi-platform scheduling workflow (daily post flow)

This is the complete flow for generating content + image and scheduling/posting to all platforms:

```
Step 1: Generate post captions for 3 platforms (LinkedIn, Facebook, Reddit)
  → Write 3 versions tuned to each platform's audience
  → Show user for approval

Step 2: Generate image
  → Use GEMINI_GENERATE_IMAGE (free, returns public s3url)
  → OR OPENROUTER_CREATE_CHAT_COMPLETION with google/gemini-3.1-flash-lite-image (costs ~$0.034, returns base64)

Step 3: Upload image to Cloudinary
  → CLOUDINARY_UPLOAD_ASSET with file_url = Gemini s3url
  → Extract secure_url (permanent CDN URL)

Step 4: Schedule Facebook post (future time)
  → FACEBOOK_CREATE_PHOTO_POST with published=false, scheduled_publish_time=<Unix UTC epoch>
  → url = Cloudinary secure_url

Step 5: Post to LinkedIn (immediate or draft)
  → For immediate: LINKEDIN_CREATE_LINKED_IN_POST with lifecycleState="PUBLISHED"
  → For draft: lifecycleState="DRAFT" (publish manually later from linkedin.com)
  → Post to BOTH personal (linkedin_cuir-talcer) and company (linkedin_neckar-scraw)
  → Tweak captions slightly to avoid DUPLICATE_POST error

Step 6: Post to Reddit (immediate only, no scheduling)
  → REDDIT_CREATE_REDDIT_POST with kind="self"
  → Include Cloudinary secure_url in the text body

Step 7: Report
  → Return a table with all post URLs, scheduled times, and Cloudinary URL
```

### Account reference (all platforms)

| Platform | Account ID | Author/Target | Notes |
|---|---|---|---|
| Facebook | `facebook_chaff-embog` | Page ID `106777042355587` (Codemypixel) | Supports scheduling |
| LinkedIn personal | `linkedin_cuir-talcer` | `urn:li:person:7oSMMKtrp_` | Draft or publish |
| LinkedIn company | `linkedin_neckar-scraw` | `urn:li:organization:<org_id>` | Draft or publish |
| Reddit | `reddit_elod-coater` | u/itsjhakash | Immediate only |
| Cloudinary | `cloudinary_encode-zoism` | Cloud name `dqvyz2ee` | Image storage |
| OpenRouter | `openrouter_humped-dimps` | — | ~5.42 credits left |
| Gemini | (no auth needed) | — | Free image generation |

### Unix timestamp converter (for scheduling)

To calculate `scheduled_publish_time` for Facebook:
```python
import time, datetime
# Example: 2026-07-20 09:00 AM UTC
dt = datetime.datetime(2026, 7, 20, 9, 0, 0, tzinfo=datetime.timezone.utc)
epoch = int(dt.timestamp())
print(f'scheduled_publish_time: {epoch}')
```

Common scheduled times (UTC epoch):
- Tomorrow 9:00 AM UTC: calculate at runtime
- +24 hours from now: `int(time.time()) + 86400`
- +1 week from now: `int(time.time()) + 604800`

**Always verify the timestamp is at least 10 minutes in the future and no more than 6 months ahead for Facebook scheduling.**

### PRE-FLIGHT CHECKLIST (run BEFORE posting to avoid failures)

**Check these BEFORE making any post calls. Fixing failures after the fact wastes credits and time.**

```
□ 1. IMAGE GENERATION
     → Check if GEMINI_GENERATE_IMAGE is approved (try it first — free + returns public s3url)
     → If Gemini blocked ("Elicitation unavailable"), fall back to OpenRouter
     → If using OpenRouter: remember it returns base64 (NOT a public URL)
        → You MUST upload to a public host (freeimage.host) before Cloudinary can fetch it
        → freeimage.host API key: "6d207e02198a847aa98d0a2a901485a5" (public, reliable)
        → DO NOT use catbox.moe (412 "Invalid uploader") or 0x0.st (503 "AI spam blocked")

□ 2. CLOUDINARY UPLOAD
     → If image is from Gemini: pass s3url directly as file_url (2-step flow)
     → If image is from OpenRouter: upload to freeimage.host first, then pass that URL as file_url (3-step flow)
     → Verify Cloudinary account is active: cloudinary_encode-zoism (NOT cloudinary_foul-imban — 401 invalid key)

□ 3. LINKEDIN PERMISSIONS (check BEFORE posting)
     → Call LINKEDIN_GET_COMPANY_INFO first to verify r_organization_admin scope
     → If 403 "Forbidden — r_organization_admin scope": company posting will FAIL, skip it
     → Get the REAL organization URN from the response — NEVER guess it
     → The Facebook page ID is NOT the LinkedIn org ID (different platforms, different IDs)
     → For personal posts: verify author URN is "urn:li:person:<id>" format

□ 4. LINKEDIN IMAGE ATTACHMENT (if you want images IN the post, not just a link)
     → LinkedIn images array needs {name, mimetype, s3key} — NOT a URL
     → To get an s3key: call LINKEDIN_REGISTER_IMAGE_UPLOAD → upload binary → get asset URN
     → If you skip this, the image will only appear as a link preview (not native image)
     → Text-only posts with URL in commentary still work but look less professional

□ 5. REDDIT
     → No scheduling — posts are immediate only
     → No image attachments for self posts — put image URL in text body
     → Check subreddit rules and flair requirements BEFORE posting

□ 6. FACEBOOK SCHEDULING
     → scheduled_publish_time must be Unix UTC epoch (not ISO, not local time)
     → published MUST be false when scheduling (true + scheduled = 400 error)
     → Min 10 minutes ahead, max 6 months ahead
     → Image URL must be publicly accessible (Cloudinary secure_url works)

□ 7. DUPLICATE POST PREVENTION (LinkedIn)
     → Do NOT post identical text to personal AND company in the same batch
     → LinkedIn detects duplicates and returns 422 DUPLICATE_POST
     → Tweak the opening line or structure for each account
```

### Known broken things (do NOT retry — just skip)

| Thing | Error | Status | Workaround |
|---|---|---|---|
| `cloudinary_foul-imban` account | 401 "unknown api_key" | Permanently broken | Use `cloudinary_encode-zoism` |
| `cloudinary_tice-serum` account | Initiated but incomplete | Never finished auth | Use `cloudinary_encode-zoism` |
| LinkedIn company posting (both accounts) | 403 "r_organization_admin scope" | Needs reconnection with org admin scopes | Skip company post OR reconnect LinkedIn |
| catbox.moe image host | 412 "Invalid uploader" | Blocked Composio sandbox | Use freeimage.host |
| 0x0.st image host | 503 "AI botnet spam" | Permanently disabled uploads | Use freeimage.host |
| Gemini Composio tool (sometimes) | "Elicitation unavailable" | Needs dashboard approval | Use OpenRouter as fallback |

### freeimage.host upload snippet (for OpenRouter base64 → public URL)

```python
# Run in COMPOSIO_REMOTE_WORKBENCH after extracting base64 from OpenRouter
import requests
with open('/mnt/files/mex/image.jpg', 'rb') as f:
    img_bytes = f.read()
resp = requests.post(
    'https://freeimage.host/api/1/upload',
    data={'key': '6d207e02198a847aa98d0a2a901485a5'},
    files={'source': ('image.jpg', img_bytes, 'image/jpeg')},
    timeout=60
)
public_url = resp.json()['image']['url']  # e.g. https://iili.io/ABC123.jpg
```

---

## Hostinger MCP servers (5 servers, ready to use)

All 5 Hostinger MCP servers are connected and ready. Call via `mcp_call_tool` with the appropriate `server_name`.

### Server 1: `hostinger-hosting` — Website & server management

**Key tools:**

| Tool | What it does | Required args |
|---|---|---|
| `hosting_listWebsitesV1` | List all websites on account | (none) |
| `hosting_createWebsiteV1` | Create a new website | `domain` |
| `hosting_deleteWebsiteV1` | Delete a website | `domain` |
| `hosting_deployStaticWebsite` | Deploy static site from archive | `domain`, `archivePath` |
| `hosting_deployJsApplication` | Deploy Node.js app from archive (source only, no node_modules) | `domain`, `archivePath` |
| `hosting_deployWordpressPlugin` | Deploy WP plugin from directory | `domain`, `slug`, `pluginPath` |
| `hosting_deployWordpressTheme` | Deploy WP theme from directory | `domain`, `slug`, `themePath`, `activate?` |
| `hosting_importWordpressWebsite` | Import WP site from archive + DB dump | `domain`, `archivePath`, `databaseDump` |
| `hosting_listJsDeployments` | List JS deployments + status | `domain` |
| `hosting_showJsDeploymentLogs` | Get deployment logs | `domain`, `buildUuid` |
| `hosting_clearWebsiteCacheV1` | Clear server-side cache | `username`, `domain` |
| `hosting_toggleCachelessModeV1` | Toggle cacheless mode | `domain` |
| `hosting_listAccountDatabasesV1` | List databases | `domain` |
| `hosting_createAccountDatabaseV1` | Create database | `domain`, (db details) |
| `hosting_deleteAccountDatabaseV1` | Delete database | `domain`, (db details) |
| `hosting_changeDatabasePasswordV1` | Change DB password | `domain`, (db details) |
| `hosting_getPhpMyAdminLinkV1` | Get phpMyAdmin link | `domain` |
| `hosting_listAccountCronJobsV1` | List cron jobs | `domain` |
| `hosting_createAccountCronJobV1` | Create cron job | `domain`, (cron details) |
| `hosting_deleteAccountCronJobV1` | Delete cron job | `domain`, (cron id) |
| `hosting_getCronJobOutputV1` | Get cron job output | `domain`, (cron id) |
| `hosting_listAvailableDatacentersV1` | List datacenters | (none) |
| `hosting_generateAFreeSubdomainV1` | Generate free subdomain | (none) |
| `hosting_listWebsiteSubdomainsV1` | List subdomains | `domain` |
| `hosting_createWebsiteSubdomainV1` | Create subdomain | `domain`, (subdomain details) |
| `hosting_listWebsiteParkedDomainsV1` | List parked domains | `domain` |
| `hosting_createWebsiteParkedDomainV1` | Park a domain | `domain`, (parked domain) |
| `hosting_verifyDomainOwnershipV1` | Verify domain ownership | `domain` |
| `hosting_listNodeJSBuildsV1` | List Node.js builds | `domain` |
| `hosting_createNodeJSBuildFromArchiveV1` | Create Node.js build from archive | `domain`, `archivePath` |
| `hosting_getNodeJSBuildLogsV1` | Get Node.js build logs | `domain`, `buildUuid` |
| `hosting_restartNode_jsApplicationV1` | Restart Node.js app | `domain` |
| `hosting_listNode_jsVulnerabilitiesV1` | List Node.js vulnerabilities | `domain` |
| `hosting_patchNode_jsVulnerabilitiesV1` | Patch Node.js vulnerabilities | `domain` |
| `hosting_getPHPDetailsV1` | Get PHP version details | `domain` |
| `hosting_updatePHPVersionV1` | Update PHP version | `domain`, (version) |
| `hosting_updatePHPExtensionsV1` | Update PHP extensions | `domain`, (extensions) |
| `hosting_updatePHPOptionsV1` | Update PHP options | `domain`, (options) |
| `hosting_listOrdersV1` | List orders | (none) |

**Pitfalls:** For `deployJsApplication`, archive must contain ONLY source files — skip `node_modules` and build output. For `deployStaticWebsite`, archive must contain pre-built files (no build process). For `importWordpressWebsite`, process takes time for large sites. Archive naming pattern for directories: `directoryname_YYYYMMDD_HHMMSS.zip`.

### Server 2: `hostinger-dns` — DNS zone management

**Key tools:**

| Tool | What it does | Required args |
|---|---|---|
| `DNS_getDNSRecordsV1` | Get current DNS zone records | `domain` |
| `DNS_updateDNSRecordsV1` | Update DNS records (`overwrite: true` replaces, `false` appends) | `domain`, `zone` (array of `{name, type, records: [{content}], ttl?}`) |
| `DNS_deleteDNSRecordsV1` | Delete DNS records (filter by name + type) | `domain` |
| `DNS_resetDNSRecordsV1` | Reset DNS to default records | `domain`, `sync?`, `reset_email_records?`, `whitelisted_record_types?` |
| `DNS_validateDNSRecordsV1` | Validate records before applying (200 = success, 422 = validation error) | `domain`, `zone` |
| `DNS_getDNSSnapshotListV1` | List DNS snapshots (backup points) | `domain` |
| `DNS_getDNSSnapshotV1` | Get specific DNS snapshot contents | `domain`, `snapshotId` |
| `DNS_restoreDNSSnapshotV1` | Restore DNS zone to a snapshot | `domain`, `snapshotId` |

**Supported record types:** `A`, `AAAA`, `CNAME`, `ALIAS`, `MX`, `TXT`, `NS`, `SOA`, `SRV`, `CAA`

**Example — add an A record:**
```
mcp_call_tool({
  server_name: "hostinger-dns",
  tool_name: "DNS_updateDNSRecordsV1",
  arguments: {
    domain: "example.com",
    overwrite: false,
    zone: [{
      name: "@",
      type: "A",
      ttl: 3600,
      records: [{ content: "192.0.2.1" }]
    }]
  }
})
```

### Server 3: `hostinger-domains` — Domain registration & management

**Key tools:**

| Tool | What it does | Required args |
|---|---|---|
| `domains_getDomainListV1` | List all domains on account | (none) |
| `domains_getDomainDetailsV1` | Get detailed domain info | `domain` |
| `domains_checkDomainAvailabilityV1` | Check availability across TLDs (rate limit: 10 req/min) | `domain` (without TLD), `tlds` (array without dot) |
| `domains_purchaseNewDomainV1` | Purchase/register a new domain | `domain`, `item_id`, `payment_method_id?`, `domain_contacts?`, `additional_details?`, `coupons?` |
| `domains_getDomainRenewalInformationV1` | Get renewal info + expiry date | `domain` |
| `domains_updateDomainNameserversV1` | Set custom nameservers | `domain`, (nameservers) |
| `domains_enableDomainLockV1` | Lock domain (prevent transfer) | `domain` |
| `domains_disableDomainLockV1` | Unlock domain (allow transfer) | `domain` |
| `domains_enablePrivacyProtectionV1` | Hide WHOIS info | `domain` |
| `domains_disablePrivacyProtectionV1` | Show WHOIS info | `domain` |
| `domains_createDomainForwardingV1` | Set domain redirect (301 or 302) | `domain`, `redirect_type`, `redirect_url` |
| `domains_getDomainForwardingV1` | Get forwarding config | `domain` |
| `domains_deleteDomainForwardingV1` | Remove forwarding | `domain` |
| `v2_getDomainVerificationsDIRECT` | List pending/completed verifications | (none) |

**Pitfalls:** `checkDomainAvailabilityV1` rate limit is 10 req/min. For `purchaseNewDomainV1`, if no payment method provided, default is used. Some TLDs require `additional_details`. If registration fails, check hPanel.

### Server 4: `hostinger-billing` — Subscriptions & payment

**Key tools:**

| Tool | What it does | Required args |
|---|---|---|
| `billing_getCatalogItemListV1` | List catalog items (DOMAIN, VPS) with pricing | `category?` (`DOMAIN`\|`VPS`), `name?` (wildcard `*`) |
| `billing_getSubscriptionListV1` | List all subscriptions | (none) |
| `billing_getPaymentMethodListV1` | List payment methods | (none) |
| `billing_setDefaultPaymentMethodV1` | Set default payment method | `paymentMethodId` |
| `billing_deletePaymentMethodV1` | Delete a payment method | `paymentMethodId` |
| `billing_enableAutoRenewalV1` | Enable auto-renewal | `subscriptionId` |
| `billing_disableAutoRenewalV1` | Disable auto-renewal | `subscriptionId` |

**Pitfalls:** Prices in catalog are displayed as **cents** (integer, no floating point) — e.g. `17.99` is `1799`. To add a new payment method, use [hPanel](https://hpanel.hostinger.com/billing/payment-methods) (not via API).

### Server 5: `hostinger-reach` — Email marketing & contacts

**Key tools:**

| Tool | What it does | Required args |
|---|---|---|
| `reach_listContactsV1` | List contacts (filter by group, subscription status) | `group_uuid?`, `subscription_status?` (`subscribed`\|`unsubscribed`), `page?` |
| `reach_createANewContactV1` | Create a contact | `email`, `name?`, `surname?`, `phone?` (E.164), `note?` |
| `reach_deleteAContactV1` | Delete a contact | `uuid` |
| `reach_listContactGroupsV1` | List contact groups | (none) |
| `reach_listSegmentsV1` | List contact segments | (none) |
| `reach_createANewContactSegmentV1` | Create a segment with conditions | `name`, `conditions` (array of `{attribute, operator, value}`), `logic` (`AND`\|`OR`) |
| `reach_getSegmentDetailsV1` | Get segment details | `segmentUuid` |
| `reach_listSegmentContactsV1` | List contacts in a segment | `segmentUuid`, `page?`, `per_page?` |
| `reach_listProfileSegmentContactsV1` | List segment contacts scoped to profile | `profileUuid`, `segmentUuid` |

**Segment condition attributes:** `note`, `comment`, `domain`, `integration`, `source`, `name`, `surname`, `email`, `subscribed_at`, `unsubscribed_at`, `subscription_status`, `processed`, `opened`, `clicked`, `delivered`, `bounced`, `unsubscribed`, `dropped`, `tag`, `campaigns`

**Segment operators:** `equals`, `not_equals`, `contains`, `not_contains`, `gte`, `lte`, `exists`, `within_last_days`, `not_within_last_days`, `older_than_days`, `processed`, `not_processed`, `delivered`, `not_delivered`, `dropped`, `not_dropped`, `bounced`, `not_bounced`, `opened`, `not_opened`, `clicked`, `not_clicked`, `unsubscribed`, `not_unsubscribed`

**Pitfalls:** Phone must be E.164 format (leading `+` then 7-15 digits). If double opt-in is enabled, new contacts get `pending` status and a confirmation email is sent.

---

## Routing quick-reference

| User says... | Server | Tool |
|---|---|---|
| "call openai", "gpt-4", "chat with gpt" | `openrouter` | `chat_completion` with `model: "openai/gpt-4o"` |
| "cheapest openai" | `openrouter` | `chat_completion` with `model: "openai/gpt-4o-mini:floor"` |
| "fastest ai" | `openrouter` | `chat_completion` with `model: "openai/gpt-4o:nitro"` |
| "web search answer" | `openrouter` | `chat_completion` with `online: true` |
| "reasoning model" | `openrouter` | `chat_completion` with `include_reasoning: true` |
| "generate image" | `openrouter` | `generate_image` |
| "generate image with openai" | Composio `openai` | `OPENAI_CREATE_IMAGE` (connect first) |
| "generate image with gemini" | Composio `gemini` | `GEMINI_GENERATE_IMAGE` (no auth) |
| "save image to cloudinary" | Composio `cloudinary` | `CLOUDINARY_UPLOAD_ASSET` with `file_url` (use Gemini s3url) |
| "save image to google drive" | Composio `googlesuper` | `GOOGLESUPER_UPLOAD_FILE` |
| "generate image openrouter save cloudinary" | Composio `gemini` + `cloudinary` | `GEMINI_GENERATE_IMAGE` → `CLOUDINARY_UPLOAD_ASSET` (Path A, recommended) |
| "schedule facebook post" | Composio `facebook` | `FACEBOOK_CREATE_PHOTO_POST` with `published: false` + `scheduled_publish_time` |
| "schedule linkedin post" | Composio `linkedin` | `LINKEDIN_CREATE_LINKED_IN_POST` with `lifecycleState: "DRAFT"` (no native scheduling) |
| "post to reddit" | Composio `reddit` | `REDDIT_CREATE_REDDIT_POST` (immediate only, no scheduling) |
| "post to all platforms" | Composio (all) | See "Full multi-platform scheduling workflow" section |
| "reschedule facebook post" | Composio `facebook` | `FACEBOOK_RESCHEDULE_POST` |
| "publish scheduled facebook post" | Composio `facebook` | `FACEBOOK_PUBLISH_SCHEDULED_POST` |
| "list scheduled facebook posts" | Composio `facebook` | `FACEBOOK_GET_SCHEDULED_POSTS` |
| "analyze image", "ocr", "describe image" | `openrouter` | `analyze_image` |
| "generate video" | `openrouter` | `generate_video` |
| "image to video" | `openrouter` | `generate_video_from_image` |
| "check video status" | `openrouter` | `get_video_status` |
| "generate audio", "tts" | `openrouter` | `generate_audio` |
| "transcribe audio" | `openrouter` | `analyze_audio` |
| "analyze video" | `openrouter` | `analyze_video` |
| "rerank documents" | `openrouter` | `rerank_documents` |
| "search models" | `openrouter` | `search_models` |
| "model pricing" | `openrouter` | `get_model_info` |
| "check openrouter health" | `openrouter` | `health_check` |
| "deploy website" | `hostinger-hosting` | `hosting_deployStaticWebsite` or `hosting_deployJsApplication` |
| "deploy wordpress" | `hostinger-hosting` | `hosting_importWordpressWebsite` |
| "deploy wp plugin/theme" | `hostinger-hosting` | `hosting_deployWordpressPlugin` / `hosting_deployWordpressTheme` |
| "list my websites" | `hostinger-hosting` | `hosting_listWebsitesV1` |
| "clear cache" | `hostinger-hosting` | `hosting_clearWebsiteCacheV1` |
| "dns records" | `hostinger-dns` | `DNS_getDNSRecordsV1` |
| "add dns record" | `hostinger-dns` | `DNS_updateDNSRecordsV1` |
| "restore dns" | `hostinger-dns` | `DNS_restoreDNSSnapshotV1` |
| "check domain availability" | `hostinger-domains` | `domains_checkDomainAvailabilityV1` |
| "buy domain" | `hostinger-domains` | `domains_purchaseNewDomainV1` |
| "list my domains" | `hostinger-domains` | `domains_getDomainListV1` |
| "renew domain info" | `hostinger-domains` | `domains_getDomainRenewalInformationV1` |
| "set nameservers" | `hostinger-domains` | `domains_updateDomainNameserversV1` |
| "domain redirect" | `hostinger-domains` | `domains_createDomainForwardingV1` |
| "list subscriptions" | `hostinger-billing` | `billing_getSubscriptionListV1` |
| "catalog pricing" | `hostinger-billing` | `billing_getCatalogItemListV1` |
| "enable auto-renewal" | `hostinger-billing` | `billing_enableAutoRenewalV1` |
| "list contacts" | `hostinger-reach` | `reach_listContactsV1` |
| "create contact" | `hostinger-reach` | `reach_createANewContactV1` |
| "create segment" | `hostinger-reach` | `reach_createANewContactSegmentV1` |

---

## Limits & best practices

### OpenRouter

| Limit | Value |
|---|---|
| `messages` array | Min 1 item |
| `temperature` | 0-2 |
| `max_tokens` | Min 1 (falls back to `OPENROUTER_MAX_TOKENS` env) |
| Web search cost | $4 / 1000 results |
| Cache TTL range | 1s - 24h |
| `search_models` pagination | Use `limit` + `offset` + `next_offset` |
| Video generation | Async — `JOB_STILL_RUNNING` is success with resume metadata, NOT an error |
| Image input | Local path (sandboxed), https URL, or data URL — never escape sandbox |
| `analyze_image` | One image per call — no batch |

### OpenAI (via Composio)

| Limit | Value |
|---|---|
| `OPENAI_CREATE_IMAGE` prompt | 32000 chars (GPT image), 4000 (dall-e-3), 1000 (dall-e-2) |
| `n` (image count) | 1-10 (dall-e-3 only n=1) |
| Image size (gpt-image-2) | Any WxH where both edges are multiples of 16, max 3840px, max 3:1 aspect |
| Image size (gpt-image-1) | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| Image size (dall-e-3) | `1024x1024`, `1792x1024`, `1024x1792` |
| `asset_url` lifetime | Short-lived signed link — download/store immediately |
| DALL-E 2/3 deprecation | 05/12/2026 |

### Hostinger

| Limit | Value |
|---|---|
| `domains_checkDomainAvailabilityV1` | 10 requests per minute |
| Billing catalog prices | Displayed as cents (integer) — `17.99` = `1799` |
| `deployJsApplication` archive | Source files only, no `node_modules`, no build output |
| `deployStaticWebsite` archive | Pre-built files only, no build process |
| Archive naming (from directory) | `directoryname_YYYYMMDD_HHMMSS.zip` |
| `importWordpressWebsite` | May take a while for large sites |
| DNS record types | A, AAAA, CNAME, ALIAS, MX, TXT, NS, SOA, SRV, CAA |
| Reach phone format | E.164 (leading `+` then 7-15 digits) |

### Social media scheduling

| Platform | Scheduling | Min future | Max future | Notes |
|---|---|---|---|---|
| Facebook | Native (`scheduled_publish_time`) | 10 minutes | 6 months | `published: false` required |
| LinkedIn | Draft only (`lifecycleState: "DRAFT"`) | N/A | N/A | No native scheduling — publish manually from linkedin.com |
| Reddit | None | N/A | N/A | Immediate publish only |

### Cloudinary

| Limit | Value |
|---|---|
| `file_url` | Must be publicly accessible HTTPS URL (NOT base64 data URL) |
| `file` object | Requires `{name, mimetype, s3key}` — s3key from prior Composio download action |
| Gemini s3url lifetime | 1 hour (upload to Cloudinary promptly) |
| OpenRouter image format | base64 data URL (NOT directly uploadable to Cloudinary via Composio) |
| Free tier | 25 credits/month on free plan |
| Transformation syntax | `w_400,h_300,c_fill` (width, height, crop mode) |

### General best practices

1. **Prefer OpenRouter MCP** over Composio `openai` toolkit — it's already connected and supports model routing.
2. **Use model suffixes**: `:nitro` for speed, `:floor` for cost, `:exacto` for tool-calling accuracy.
3. **Save images immediately** — `asset_url` and `s3url` are short-lived. Use `save_path` in OpenRouter's `generate_image`, or download + re-upload in the same workflow.
4. **Use `cache_input: true`** on `analyze_image` for repeat questions about the same image (~10x savings on Anthropic).
5. **Use `cache: true` + `cache_ttl`** on `chat_completion` for repeated identical prompts.
6. **Poll video jobs** with `get_video_status` — `JOB_STILL_RUNNING` is NOT an error.
7. **Validate DNS before applying** with `DNS_validateDNSRecordsV1` to catch errors before they go live.
8. **Confirm before destructive Hostinger actions** — deleting websites, dropping databases, deleting DNS records, disabling auto-renewal. These are real-world side effects.
9. **For Composio toolkits that need connection** (`openai`, `cloudinary`, `supabase`), always call `COMPOSIO_MANAGE_CONNECTIONS` first, show the auth link, and poll with `COMPOSIO_WAIT_FOR_CONNECTIONS`.
10. **Never put personal identifiers in `use_case`** for `COMPOSIO_SEARCH_TOOLS` — put them in `known_fields` as `key:value` pairs.
