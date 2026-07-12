# QuasarLeads - PostgreSQL Migration Quick Start

## 🚀 Quick Installation (3 Steps)

### 1️⃣ Install Dependencies
```bash
npm install
```

### 2️⃣ Run Database Migration
```bash
npm run prisma:migrate
```
When prompted for migration name: `init_postgresql`

### 3️⃣ Start the App
```bash
npm run dev
```

## ✅ What's Done

### Database Migration
- ✅ Prisma schema created with all 12 models
- ✅ PostgreSQL connection configured
- ✅ All indexes and relationships preserved
- ✅ JSON fields for complex nested data

### Updated Files
- ✅ `prisma/schema.prisma` - Complete database schema
- ✅ `lib/prisma.ts` - Prisma client singleton
- ✅ `package.json` - Prisma dependencies and scripts
- ✅ `app/api/auth/login/route.ts` - Prisma authentication
- ✅ `app/api/auth/signup/route.ts` - Prisma user creation
- ✅ `app/api/auth/me/route.ts` - Prisma user lookup

### Models Converted (12 Total)
1. ✅ User
2. ✅ Lead
3. ✅ Booking
4. ✅ EmailTemplate
5. ✅ IncomingEmail
6. ✅ AIResponse
7. ✅ JobQueue
8. ✅ SearchJob
9. ✅ TemporaryLead
10. ✅ Availability
11. ✅ CompanySettings

## 📋 Remaining API Routes to Update

You'll need to update these routes to use Prisma:

### Critical Routes (High Priority)
- `app/api/leads/route.ts` - Lead CRUD operations
- `app/api/crm/leads/route.ts` - CRM lead management
- `app/api/bookings/route.ts` - Booking management
- `app/api/email-templates/[stage]/route.ts` - Email templates
- `app/api/credentials/route.ts` - User credentials

### Email Automation Routes
- `app/api/start-email-automation/route.ts`
- `app/api/email-responses/route.ts`
- `app/api/cron/check-email-responses/route.ts`
- `app/api/cron/send-scheduled-emails/route.ts`

### Admin Routes
- `app/api/admin/users/route.ts`
- `app/api/admin/verify-user/route.ts`

### Job Queue Routes
- `app/api/jobs/queue/route.ts`
- `app/api/jobs/status/[jobId]/route.ts`
- `app/api/temporary-leads/search/route.ts`

## 🔄 Migration Pattern

For each route, replace:

```typescript
// OLD (MongoDB/Mongoose)
import { dbConnect } from '@/lib/mongodb';
import Lead from '@/models/leadSchema';

await dbConnect();
const leads = await Lead.find({ status: 'active' });
```

With:

```typescript
// NEW (Prisma/PostgreSQL)
import { prisma } from '@/lib/prisma';

const leads = await prisma.lead.findMany({
  where: { status: 'active' }
});
```

## 🛠️ Useful Commands

```bash
# View database in browser
npm run prisma:studio

# Generate Prisma Client after schema changes
npm run prisma:generate

# Create new migration
npm run prisma:migrate

# Check migration status
npx prisma migrate status

# Format schema file
npx prisma format
```

## 🔍 Testing Checklist

After migration:
- [ ] Login works
- [ ] Signup works
- [ ] Dashboard loads
- [ ] Lead creation works
- [ ] CRM system works
- [ ] Email automation works
- [ ] Booking system works

## 📚 Documentation

- Full migration guide: `MIGRATION_GUIDE.md`
- Detailed steps: `INSTALLATION_STEPS.md`
- Prisma docs: https://www.prisma.io/docs

## ⚡ Performance Benefits

PostgreSQL + Prisma provides:
- ✅ Better query performance with proper indexes
- ✅ ACID compliance for data integrity
- ✅ Better concurrent write handling
- ✅ Native JSON support with indexing
- ✅ Type-safe database queries
- ✅ Better full-text search capabilities

## 🆘 Troubleshooting

**Error: Can't reach database**
```bash
# Check your DATABASE_URL in .env.local
echo $DATABASE_URL
```

**Error: Prisma Client not generated**
```bash
npm run prisma:generate
```

**Error: Migration failed**
```bash
# Reset and try again (⚠️ deletes data)
npx prisma migrate reset
npm run prisma:migrate
```

## 🎯 Next Steps

1. Run the migration: `npm run prisma:migrate`
2. Test authentication (login/signup)
3. Update remaining API routes one by one
4. Test each feature after updating
5. Deploy to production when ready

Your database is now ready for PostgreSQL! 🎉
