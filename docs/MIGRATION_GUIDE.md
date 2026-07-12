# MongoDB to PostgreSQL Migration Guide

## Overview
This guide documents the complete migration from MongoDB (Mongoose) to PostgreSQL (Prisma) for the QuasarLeads application.

## Database Configuration

### Environment Variables
Your `.env.local` file should contain:
```env
DATABASE_URL="postgresql://quasarflowai:07508307Ps.@db-quasar-flow.cst06is64bth.us-east-1.rds.amazonaws.com:5432/quasarflowai?schema=public"
```

## Migration Steps

### 1. Install Dependencies
```bash
npm install
```

This will install:
- `@prisma/client@^6.1.0` - Prisma Client for database queries
- `prisma@^6.1.0` (dev) - Prisma CLI for migrations

### 2. Generate Prisma Client
```bash
npm run prisma:generate
```

### 3. Run Database Migration
```bash
npm run prisma:migrate
```

When prompted, name your migration: `init_postgresql_migration`

This will:
- Create all tables in PostgreSQL
- Set up indexes
- Configure relationships

### 4. Verify Migration
```bash
npm run prisma:studio
```

This opens Prisma Studio to view your database.

## Schema Changes

### Key Differences from MongoDB

1. **IDs**: Changed from MongoDB ObjectId to CUID strings
2. **JSON Fields**: Complex nested objects stored as JSON type
   - `credentials` in User
   - `authInformation` in Lead
   - `emailHistory` in Lead
   - `emailErrors` in Lead
   - `emailValidationDetails` in Lead
   - `meetingPlatformData` in Booking
   - `workingDays` in Availability
   - `emailTimings` in CompanySettings

3. **Arrays**: String arrays supported natively
   - `tags` in Lead
   - `services` in JobQueue
   - `locations` in JobQueue
   - `variables` in EmailTemplate

4. **Relations**: Explicit foreign keys
   - User → Leads (one-to-many)
   - User → Bookings (one-to-many)
   - User → EmailTemplates (one-to-many)
   - Lead → IncomingEmails (one-to-many)
   - IncomingEmail → AIResponses (one-to-many)

## Code Changes

### Import Changes
**Before (MongoDB/Mongoose):**
```typescript
import User from '@/models/userSchema';
import Lead from '@/models/leadSchema';
import { connectDB } from '@/lib/mongodb';
```

**After (Prisma):**
```typescript
import { prisma } from '@/lib/prisma';
```

### Query Changes

#### Create
**Before:**
```typescript
const user = await User.create({
  username,
  email,
  password: hashedPassword
});
```

**After:**
```typescript
const user = await prisma.user.create({
  data: {
    username,
    email,
    password: hashedPassword
  }
});
```

#### Find One
**Before:**
```typescript
const user = await User.findOne({ email });
```

**After:**
```typescript
const user = await prisma.user.findUnique({
  where: { email }
});
```

#### Find Many
**Before:**
```typescript
const leads = await Lead.find({ status: 'active' })
  .sort({ createdAt: -1 })
  .limit(10);
```

**After:**
```typescript
const leads = await prisma.lead.findMany({
  where: { status: 'active' },
  orderBy: { createdAt: 'desc' },
  take: 10
});
```

#### Update
**Before:**
```typescript
await Lead.findByIdAndUpdate(leadId, {
  status: 'emailed',
  lastContactedAt: new Date()
});
```

**After:**
```typescript
await prisma.lead.update({
  where: { id: leadId },
  data: {
    status: 'emailed',
    lastContactedAt: new Date()
  }
});
```

#### Delete
**Before:**
```typescript
await Lead.findByIdAndDelete(leadId);
```

**After:**
```typescript
await prisma.lead.delete({
  where: { id: leadId }
});
```

#### Count
**Before:**
```typescript
const count = await Lead.countDocuments({ status: 'active' });
```

**After:**
```typescript
const count = await prisma.lead.count({
  where: { status: 'active' }
});
```

## Updated Files

### Core Files
- ✅ `prisma/schema.prisma` - Database schema
- ✅ `lib/prisma.ts` - Prisma client singleton
- ✅ `package.json` - Dependencies and scripts

### API Routes (To Update)
- `app/api/auth/login/route.ts`
- `app/api/auth/signup/route.ts`
- `app/api/auth/me/route.ts`
- `app/api/leads/route.ts`
- `app/api/crm/leads/route.ts`
- `app/api/bookings/route.ts`
- `app/api/email-templates/route.ts`
- `app/api/email-responses/route.ts`
- All other API routes

### Services (To Update)
- `lib/emailService.ts`
- `lib/openaiService.ts`
- `lib/bookingEmailService.ts`

## Testing

After migration:

1. **Test Authentication**
   - Login with existing credentials
   - Create new user
   - Verify session management

2. **Test Lead Management**
   - Create leads
   - Update lead status
   - Email automation
   - Search and filter

3. **Test Booking System**
   - Create bookings
   - Update booking status
   - Calendar integration

4. **Test Email System**
   - Email templates
   - Email automation
   - Email responses

## Rollback Plan

If issues occur:
1. Keep MongoDB connection string in `.env.local` as backup
2. Revert code changes via git
3. Restore from database backup

## Performance Considerations

PostgreSQL advantages:
- Better indexing for complex queries
- ACID compliance
- Better support for concurrent writes
- Native JSON support with indexing
- Better full-text search

## Monitoring

Use Prisma Studio for database inspection:
```bash
npm run prisma:studio
```

## Support

For issues:
1. Check Prisma logs in development
2. Verify DATABASE_URL connection
3. Check migration status: `npx prisma migrate status`
4. Reset database if needed: `npx prisma migrate reset` (⚠️ DELETES ALL DATA)
