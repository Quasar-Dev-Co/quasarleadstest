# QuasarLeads

AI-powered lead generation, email automation, and CRM platform built with Next.js 16, React 19, TypeScript, Prisma, and PostgreSQL.

> All detailed documentation files are in the [`docs/`](./docs) folder. See the [Documentation Index](#documentation-index) below.
hello
---

## What QuasarLeads Does

QuasarLeads automates the entire outbound sales pipeline:

1. **Lead Finding** — Searches Google via SerpAPI for businesses by service + location, collects leads, detects Google Ads, enriches company data
2. **Email Automation** — Sends a 7-stage email sequence to leads with configurable templates, timing, and sender identity
3. **Email Response Management** — Fetches incoming replies via IMAP, generates AI-powered responses with OpenAI, and lets users review/edit/send (or auto-send with the Auto Reply toggle)
4. **CRM Pipeline** — Drag-and-drop kanban pipeline with deal tracking, stages, won/lost analytics
5. **Booking System** — Client booking form with Zoom + Google Calendar integration, availability management
6. **Multi-User** — Each user has their own leads, credentials, AI settings, email templates, and booking config

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Frontend | React 19, TypeScript, TailwindCSS, shadcn/ui (Radix) |
| State | Redux Toolkit, React Query |
| Database | PostgreSQL + Prisma ORM |
| Email | IMAP (imapflow) for receiving, Nodemailer (SMTP) for sending |
| AI | OpenAI GPT-4o-mini for email response generation |
| Search | SerpAPI + Google Search Results NodeJS |
| Meetings | Zoom SDK, Google Calendar API |
| i18n | i18next (EN/NL) |
| Deployment | Vercel (with cron jobs) |

---

## Project Structure

```
quasarleads/
├── app/                      # Next.js App Router
│   ├── page.tsx              # Dashboard (analytics, stats)
│   ├── login/                # Login page
│   ├── signup/               # Signup page
│   ├── leads/                # Leads list & management
│   ├── allleads/             # Admin: all leads across users
│   ├── crmsystem/            # CRM pipeline (kanban)
│   ├── email-prompting/      # Email template configuration
│   ├── email-responses/      # Email response manager (AI replies)
│   ├── booking/              # Booking management (admin)
│   ├── clientbooking/        # Client-facing booking form
│   ├── settings/             # User settings
│   ├── account-settings/     # Credentials & SMTP config
│   ├── credentials/          # API key management
│   ├── admin/                # Admin panel
│   ├── privacy/              # Privacy policy
│   ├── agent-redirect/       # Agent redirect page
│   └── api/                  # API routes (see below)
├── components/               # React components
│   ├── ui/                   # shadcn/ui components (28)
│   ├── crm/                  # CRM components (AddNewLead, LeadDetails, Pipeline, etc.)
│   ├── dashboard/            # Analytics & WonLost stats
│   ├── booking/              # Booking components
│   ├── sidebar.tsx           # Navigation sidebar with EN/NL switch
│   ├── AuthGuard.tsx         # Route protection
│   └── LayoutWrapper.tsx     # Layout wrapper
├── lib/                      # Core libraries
│   ├── auth.ts               # Client-side auth (localStorage sessions)
│   ├── prisma.ts             # Prisma client singleton
│   ├── emailService.ts       # SMTP email sending (Nodemailer)
│   ├── bookingEmailService.ts# Booking notification emails
│   ├── openaiService.ts      # OpenAI API wrapper
│   ├── companyEnrichment.ts  # Company data enrichment
│   ├── googleAdsDetector.ts  # Google Ads detection
│   ├── zoomService.ts        # Zoom meeting integration
│   ├── googleCalendarService.ts # Google Calendar events
│   ├── leadEnrichment.ts     # Lead data enrichment
│   ├── api-key-rotation.ts   # API key rotation utility
│   ├── timezoneUtils.ts      # Timezone helpers
│   └── utils.ts              # General utilities (cn, etc.)
├── hooks/                    # Custom React hooks
├── redux/                    # Redux Toolkit slices
│   └── features/             # booking, emailPrompting, emailResponse, language
├── prisma/                   # Prisma schema & migrations
│   └── schema.prisma         # Database schema (11 models)
├── docs/                     # All documentation files
├── public/                   # Static assets
├── scripts/                  # Dev utilities
├── next.config.ts            # Next.js config (standalone output)
├── vercel.json               # Vercel cron jobs & function config
├── tailwind.config.ts        # TailwindCSS config
└── tsconfig.json             # TypeScript config
```

---

## Database Models

| Model | Purpose |
|-------|---------|
| **User** | Auth, admin flag, credentials JSON (IMAP/SMTP/OpenAI), relations to all |
| **Lead** | Core entity — company, contact, pipeline stage, email automation state, deal tracking |
| **Booking** | Meeting bookings with Zoom/Google Calendar integration |
| **EmailTemplate** | Per-stage, per-user email templates with timing config |
| **IncomingEmail** | Received emails from leads, reply tracking, conversation count |
| **AIResponse** | AI-generated email responses (draft → sent/failed) |
| **JobQueue** | Background job processing for lead collection |
| **SearchJob** | SerpAPI-based lead search jobs |
| **TemporaryLead** | Staging table for leads before promotion to Lead |
| **Availability** | User working days, timezone, slot duration |
| **CompanySettings** | Sender identity, email timings, company info |
| **AISettings** | AI response config (tone, prompt, auto-reply toggle, threshold) |

---

## API Routes

### Core Routes
| Route | Purpose |
|-------|---------|
| `auth/` | Login, signup, session, me |
| `leads/` | CRUD, enrich, dedup, won/lost stats |
| `jobs/` | Create, status, process, search-jobs |
| `email-responses/` | Combined view, generate, send, update, settings, incoming, ai-responses |
| `email-templates/` | Template CRUD |
| `bookings/` | Booking management |
| `availability/` | Availability CRUD |
| `company-settings/` | Company settings CRUD |
| `credentials/` | User credential management |
| `crm/` | CRM pipeline operations |

### Cron Jobs (Vercel)
| Endpoint | Schedule | Purpose |
|----------|---------|---------|
| `/api/cron/process-search-jobs` | Every 5 min | Process pending search jobs |
| `/api/cron/process-temporary-leads` | Every 1 min | Promote temporary leads to leads |
| `/api/cron/email-automation` | Every 5 min | Send scheduled outbound sequence emails |
| `/api/cron/fetch-incoming-emails` | Every 1 min | IMAP fetch replies for all users |
| `/api/cron/process-email-responses` | Every 1 min | Generate AI draft responses for unread emails |
| `/api/cron/auto-send-responses` | Every 1 min | Auto-send draft responses when Auto Reply is ON |
| `/api/cron/email-workflow` | Every 3 min | Email workflow processing |
| `/api/cron/email-cleanup` | Every 1 min | Clean up stale email states |
| `/api/cron/email-validation` | Every 3 min | Validate lead email addresses |

---

## Email Response System Flow

```
Lead replies to email
        │
        ▼
IMAP Cron (every 1 min)
  fetches replies → saves as IncomingEmail
        │
        ▼
AI Cron (every 1 min)
  generates draft AIResponse via OpenAI
  (3rd+ reply → Dutch final template)
        │
        ▼
┌─── Auto Reply OFF ───┐    ┌─── Auto Reply ON ──────┐
│ User reviews/edits    │    │ Auto-send Cron          │
│ in /email-responses   │    │ sends draft immediately │
│ User clicks "Send"    │    │ (every 1 min)           │
└───────────────────────┘    └─────────────────────────┘
        │                            │
        ▼                            ▼
  SMTP sends email → AIResponse status: 'sent'
                  → IncomingEmail status: 'responded'
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- SerpAPI key, OpenAI API key

### Environment Variables (`.env`)
```env
DATABASE_URL=postgresql://user:pass@host:port/db
OPENAI_API_KEY=your_openai_key
SERPAPI_KEY=your_serpapi_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Installation
```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build
```bash
npm run build    # prisma generate + next build
npm start        # production server
```

---

## Documentation Index

All detailed documentation is in the [`docs/`](./docs) folder:

### Setup & Deployment
- [Installation Steps](./docs/INSTALLATION_STEPS.md) — Step-by-step install guide
- [Quick Start](./docs/QUICK_START.md) — Fast setup reference
- [Vercel Deployment Guide](./docs/VERCEL_DEPLOYMENT_GUIDE.md) — Deploy to Vercel
- [Migration Guide](./docs/MIGRATION_GUIDE.md) — MongoDB → PostgreSQL migration
- [Cronjob Setup](./docs/CRONJOB_SETUP.md) — Vercel cron configuration

### Email System
- [Email Setup Instructions](./docs/EMAIL_SETUP_INSTRUCTIONS.md) — IMAP/SMTP setup
- [IMAP Gmail Setup](./docs/IMAP_GMAIL_SETUP.md) — Gmail-specific IMAP config
- [Email Response Setup Guide](./docs/EMAIL_RESPONSE_SETUP_GUIDE.md) — Response system setup
- [Email Response System Documentation](./docs/EMAIL_RESPONSE_SYSTEM_DOCUMENTATION.md) — Full system docs
- [Email Response Flowchart](./docs/EMAIL_RESPONSE_FLOWCHART.md) — Visual flowcharts
- [Email Sequence Reply Guide](./docs/EMAIL_SEQUENCE_REPLY_GUIDE.md) — Sequence reply handling
- [Automatic AI Response Workflow](./docs/AUTOMATIC_AI_RESPONSE_WORKFLOW.md) — AI response pipeline
- [AI Email Cleanup System](./docs/AI_EMAIL_CLEANUP_SYSTEM.md) — Email cleanup logic
- [Email Automation Bug Fix](./docs/EMAIL_AUTOMATION_BUG_FIX.md) — Bug fix documentation
- [Critical Fix: Auto Send Removed](./docs/CRITICAL_FIX_AUTO_SEND_REMOVED.md) — Auto-send change details

### Features
- [Booking System Guide](./docs/BOOKING_SYSTEM_GUIDE.md) — Booking system docs
- [Company Owner Lookup System](./docs/COMPANY_OWNER_LOOKUP_SYSTEM.md) — Owner lookup
- [User Lead Assignment](./docs/USER_LEAD_ASSIGNMENT_IMPLEMENTATION.md) — Lead assignment
- [Step-by-Step Processing Guide](./docs/STEP_BY_STEP_PROCESSING_GUIDE.md) — Processing walkthrough
- [Background Jobs](./docs/README_BACKGROUND_JOBS.md) — Job system overview

### Fixes & Status
- [Admin Status Bug Fix](./docs/ADMIN_STATUS_BUG_FIX.md) — Admin status fix
- [Signup System Fix](./docs/SIGNUP_SYSTEM_FIX.md) — Signup fix
- [Fix Summary](./docs/FIX_SUMMARY.md) — General fix summary
- [System Status](./docs/SYSTEM_STATUS.md) — Current system status

### Diagrams
- [Core Flow Diagram](./docs/email_response_core_flow.png) — Core email flow
- [Main Flow Diagram](./docs/email_response_main_flow.png) — Main email flow
- [Full Flowchart](./docs/email_response_flowchart.png) — Complete flowchart

### Other
- [Language Switching](./docs/language-switching.md) — i18n EN/NL setup
- [Development](./docs/DEVELOPMENT.md) — Development notes

---

## Scripts

```bash
npm run dev              # Start dev server
npm run build            # Build for production (prisma generate + next build)
npm run start            # Start production server
npm run lint             # Run ESLint
npm run prisma:generate  # Generate Prisma client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio (DB GUI)
```
