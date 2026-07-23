# Daily Multi-Platform Post Flow + Schedule

**Owner:** Johirul Hoq Akash / CodeMyPixel
**Created:** 2026-07-19
**Platforms:** Facebook (Codemypixel page), LinkedIn (personal + company), Reddit (u/itsjhakash)
**Image model:** `google/gemini-3.1-flash-lite-image` via OpenRouter
**Image storage:** Cloudinary

---

## How to trigger the flow

Just say one of:
- "post about [topic]"
- "run today's post"
- "post day 5"
- "post [topic] to all platforms"

I will then execute the 6-step flow below automatically.

---

## The 6-step execution flow

### Step 1 — Generate post copy for 3 platforms

I write 3 versions of the post, each tuned to the platform:

| Platform | Tone | Length | Format |
|---|---|---|---|
| **LinkedIn** (personal + company) | Professional, thought-leadership, founder voice | 150-300 words | Hook → body → CTA + 3-5 hashtags |
| **Facebook** (Codemypixel page) | Conversational, brand-warm, slightly casual | 80-150 words | Hook → short body → CTA |
| **Reddit** (self post) | Community-native, value-first, no hard sell | 200-400 words | Title (max 300 chars) + body markdown, no hashtags |

I show you all 3 drafts for approval before generating the image.

### Step 2 — Generate the post image

```
mcp_call_tool({
  server_name: "openrouter",
  tool_name: "generate_image",
  arguments: {
    model: "google/gemini-3.1-flash-lite-image",
    prompt: "<visual prompt derived from the post topic, CodeMyPixel brand-aligned>",
    aspect_ratio: "1:1",
    save_path: "out/post-<date>.png"
  }
})
```

- Image is 1:1 (works on all 3 platforms)
- Prompt includes brand cues: modern, clean, tech, blue/purple palette, no text overlay unless requested
- Saved to output sandbox

### Step 3 — Upload image to Cloudinary

```
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "CLOUDINARY_UPLOAD_ASSET",
    account: "cloudinary_foul-imban",
    arguments: {
      file_url: "<https URL of generated image from step 2>",
      public_id: "social-<date>-<topic-slug>",
      folder: "social-posts"
    }
  }]
})
```

- Captures `data.public_id` and `data.secure_url` (durable CDN URL)
- The `secure_url` is used as the public image URL for Facebook + LinkedIn posts

### Step 4 — Post to Facebook (Codemypixel page)

```
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "FACEBOOK_CREATE_PHOTO_POST",
    account: "facebook_chaff-embog",
    arguments: {
      page_id: "106777042355587",
      message: "<Facebook caption from step 1>",
      url: "<Cloudinary secure_url from step 3>"
    }
  }]
})
```

- Posts to the Codemypixel Facebook page (not personal timeline)
- Captures returned `post_id` for the report

### Step 5 — Post to LinkedIn (personal + company page)

LinkedIn requires a 2-step image flow: register upload, then reference in post.

```
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [
    {
      tool_slug: "LINKEDIN_REGISTER_IMAGE_UPLOAD",
      account: "linkedin_cuir-talcer",
      arguments: { ... }
    },
    {
      tool_slug: "LINKEDIN_REGISTER_IMAGE_UPLOAD",
      account: "linkedin_neckar-scraw",
      arguments: { ... }
    }
  ]
})
```

Then post to both accounts in parallel:

```
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [
    {
      tool_slug: "LINKEDIN_CREATE_LINKED_IN_POST",
      account: "linkedin_cuir-talcer",
      arguments: {
        author: "urn:li:person:7oSMMKtrp_",
        commentary: "<LinkedIn caption from step 1>",
        visibility: "PUBLIC",
        content: { media: { id: "<upload urn from register step>" } }
      }
    },
    {
      tool_slug: "LINKEDIN_CREATE_LINKED_IN_POST",
      account: "linkedin_neckar-scraw",
      arguments: {
        author: "urn:li:organization:<company_id>",
        commentary: "<LinkedIn caption from step 1>",
        visibility: "PUBLIC",
        content: { media: { id: "<upload urn from register step>" } }
      }
    }
  ]
})
```

- Personal post: `urn:li:person:7oSMMKtrp_`
- Company post: CodeMyPixel page (account `linkedin_neckar-scraw`)
- Both get the same image + caption (or I can tweak the company version to be more brand-formal)

### Step 6 — Post to Reddit (self text post)

```
COMPOSIO_MULTI_EXECUTE_TOOL({
  tools: [{
    tool_slug: "REDDIT_CREATE_REDDIT_POST",
    account: "reddit_elod-coater",
    arguments: {
      subreddit: "<chosen subreddit>",
      title: "<Reddit title from step 1>",
      kind: "self",
      text: "<Reddit body markdown from step 1>"
    }
  }]
})
```

- Reddit self posts are text-only (no image in the post body via API for most subreddits)
- I include the Cloudinary image URL inside the body text so readers can view it
- Default subreddits (rotated by topic — see schedule):
  - `r/SideProject` — product launches, project updates
  - `r/startups` — founder lessons, startup advice
  - `r/Entrepreneur` — business building, AI for business
  - `r/SaaS` — SaaS growth, AI integration
  - `r/smallbusiness` — AI for small business
  - `r/artificial` — AI education, agentic AI
  - `r/ChatGPT` — AI tools, prompts
  - `r/n8n` — automation content
  - `r/webdev` — web development, AI in dev

### Final report

After all posts go live, I give you a summary table:

| Platform | Account | Post URL | Status |
|---|---|---|---|
| Facebook | Codemypixel page | https://facebook.com/... | Live |
| LinkedIn | Personal | https://linkedin.com/... | Live |
| LinkedIn | CodeMyPixel page | https://linkedin.com/... | Live |
| Reddit | u/itsjhakash | https://reddit.com/... | Live |
| Cloudinary | — | https://res.cloudinary.com/... | Stored |

---

## Pre-flight checklist (I run this before every post)

1. All 4 platforms connected? (Facebook, LinkedIn x2, Reddit, Cloudinary) — verified 2026-07-19
2. OpenRouter model valid? `google/gemini-3.1-flash-lite-image` — validated
3. Facebook page ID: `106777042355587` (Codemypixel)
4. LinkedIn personal URN: `urn:li:person:7oSMMKtrp_`
5. LinkedIn company account: `linkedin_neckar-scraw`
6. Reddit account: `reddit_elod-coater` (u/itsjhakash)
7. Cloudinary account: `cloudinary_foul-imban`

---

## Account reference

| Platform | Account ID | Alias | Default |
|---|---|---|---|
| Facebook | `facebook_chaff-embog` | — | Yes |
| LinkedIn (personal) | `linkedin_cuir-talcer` | — | No |
| LinkedIn (company) | `linkedin_neckar-scraw` | codemypixel-page | Yes |
| Reddit | `reddit_elod-coater` | — | Yes |
| Cloudinary | `cloudinary_foul-imban` | — | Yes |

---

## 30-Day Daily Post Schedule

One post per day. Rotate categories so the feed stays varied. Each day has a topic + the subreddit to target.

### Week 1 — AI for Founders

| Day | Date | Category | Topic | Subreddit |
|---|---|---|---|---|
| 1 | Mon Jul 20 | Contrarian take | "Most agencies still build websites like it's 2018" | r/SideProject |
| 2 | Tue Jul 21 | AI education | "What is Agentic AI? The paradigm shift every founder must understand" | r/ChatGPT |
| 3 | Wed Jul 22 | Company milestone | "2 years ago we started from Narayanganj — here's what we learned" | r/startups |
| 4 | Thu Jul 23 | Founder advice | "The 5 questions I ask before taking on a new client" | r/Entrepreneur |
| 5 | Fri Jul 24 | Social proof | "Before vs after: how we added AI chatbot to a client's site" | r/SaaS |
| 6 | Sat Jul 25 | Quick win list | "5 signs your website is losing you customers" | r/smallbusiness |
| 7 | Sun Jul 26 | Repurpose | "New YouTube video: AI Agent Architecture breakdown" | r/artificial |

### Week 2 — Website ROI & Conversions

| Day | Date | Category | Topic | Subreddit |
|---|---|---|---|---|
| 8 | Mon Jul 27 | Contrarian take | "Your website isn't a brochure. It's a sales rep that never sleeps" | r/Entrepreneur |
| 9 | Tue Jul 28 | Quick win list | "7 website mistakes I see every day" | r/webdev |
| 10 | Wed Jul 29 | AI education | "Why your AI chatbot feels dumb — and how to fix it" | r/ChatGPT |
| 11 | Thu Jul 30 | Founder advice | "Why we don't do fixed-price projects anymore" | r/startups |
| 12 | Fri Aug 1 | Social proof | "How we helped a client reduce support tickets by 60% with AI" | r/SaaS |
| 13 | Sat Aug 2 | Company milestone | "Team spotlight: meet our CTO Sabbir Ahmed" | r/SideProject |
| 14 | Sun Aug 3 | Repurpose | "Just published our updated Company Capability Document" | r/Entrepreneur |

### Week 3 — Agency Behind-the-Scenes

| Day | Date | Category | Topic | Subreddit |
|---|---|---|---|---|
| 15 | Mon Aug 4 | Contrarian take | "No-code is great. No-architecture is a disaster" | r/webdev |
| 16 | Tue Aug 5 | AI education | "The AI stack of a modern agency — what we use daily" | r/artificial |
| 17 | Wed Aug 6 | Founder advice | "How I manage a remote team across time zones" | r/Entrepreneur |
| 18 | Thu Aug 7 | Quick win list | "4 ways to add AI to your existing website (no rebuild needed)" | r/smallbusiness |
| 19 | Fri Aug 8 | Social proof | "Why a client chose CodeMyPixel over 3 other agencies" | r/SaaS |
| 20 | Sat Aug 9 | Company milestone | "We just hit 100+ deployments — reflection post" | r/startups |
| 21 | Sun Aug 10 | Repurpose | "n8n workflow: how we automated client onboarding" | r/n8n |

### Week 4 — SaaS Growth & AI Integration

| Day | Date | Category | Topic | Subreddit |
|---|---|---|---|---|
| 22 | Mon Aug 11 | Contrarian take | "SaaS is dead. It's being rebuilt with native LLM integration" | r/SaaS |
| 23 | Tue Aug 12 | AI education | "LLM Integration for SaaS: the technical and business case" | r/ChatGPT |
| 24 | Wed Aug 13 | Founder advice | "The one hire that 10x'd CodeMyPixel" | r/startups |
| 25 | Thu Aug 14 | Quick win list | "5 things every SaaS landing page needs in 2026" | r/SaaS |
| 26 | Fri Aug 15 | Social proof | "From idea to launch in 4 weeks — project teardown" | r/SideProject |
| 27 | Sat Aug 16 | Company milestone | "Eid Mubarak from the CodeMyPixel team" | r/Entrepreneur |
| 28 | Sun Aug 17 | Repurpose | "Make.com vs n8n: when we choose each" | r/n8n |

### Days 29-30 — Founder Journey

| Day | Date | Category | Topic | Subreddit |
|---|---|---|---|---|
| 29 | Mon Aug 18 | Founder advice | "What I wish I knew before starting an agency in Bangladesh" | r/Entrepreneur |
| 30 | Tue Aug 19 | Contrarian take | "Agencies that don't sell AI in 2026 will be gone by 2027" | r/startups |

---

## Image prompt style guide

For every post, I derive the image prompt from the topic using this template:

```
A modern, clean illustration of [topic visual concept], 
minimalist tech aesthetic, blue and purple color palette, 
flat design with subtle gradients, no text overlay, 
professional social media post image, 1:1 aspect ratio
```

**Brand cues (always included):**
- Modern, clean, minimalist
- Blue + purple palette (CodeMyPixel brand)
- Flat design with subtle gradients
- No text overlay (text is in the post caption)
- 1:1 aspect ratio (works on Facebook, LinkedIn, Reddit)

**Topic-specific examples:**
- "Agentic AI" → "a network of interconnected AI nodes forming an autonomous system"
- "Website ROI" → "a website funnel with conversion arrows and growth chart"
- "Founder advice" → "a founder at a clean desk with a laptop, sunrise through window"
- "SaaS is dead" → "a phoenix rising from old SaaS app icons, reborn as AI-native"

---

## Rules I follow every post

1. **Always show you the 3 captions for approval** before generating the image and posting
2. **Never post without explicit approval** — these are public, real-world posts
3. **Reddit posts are text-only** (API limit) — image URL goes in the body text
4. **LinkedIn posts go to BOTH personal and company page** unless you say otherwise
5. **Facebook posts go to the Codemypixel page** (not personal timeline)
6. **Image is always uploaded to Cloudinary first** for a durable CDN URL
7. **If any platform fails**, I report which one failed and why, then retry that platform only
8. **Hashtags**: LinkedIn 3-5, Facebook 2-3, Reddit none
9. **CTA varies by platform**: LinkedIn → "DM me", Facebook → "Visit codemypixel.com", Reddit → community-native question
10. **Track every post URL** in the final report so you can monitor engagement

---

## Subreddit rotation map

| Category | Default subreddit | Fallback |
|---|---|---|
| Contrarian take | r/startups | r/Entrepreneur |
| AI education | r/ChatGPT | r/artificial |
| Company milestone | r/SideProject | r/startups |
| Founder advice | r/Entrepreneur | r/startups |
| Social proof | r/SaaS | r/SideProject |
| Quick win list | r/smallbusiness | r/Entrepreneur |
| Repurpose (n8n/Make) | r/n8n | r/webdev |
| Repurpose (YouTube) | r/artificial | r/ChatGPT |

---

*Last updated: 2026-07-19. Say "run today's post" or "post day N" to execute.*
