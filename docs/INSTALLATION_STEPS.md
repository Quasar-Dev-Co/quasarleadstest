# QuasarLeads - PostgreSQL Migration Installation Steps

## Step-by-Step Installation Guide

### Step 1: Install Dependencies
```bash
npm install
```

This will install all dependencies including Prisma.

### Step 2: Verify Environment Variables
Make sure your `.env.local` file has:
```env
DATABASE_URL="postgresql://quasarflowai:07508307Ps.@db-quasar-flow.cst06is64bth.us-east-1.rds.amazonaws.com:5432/quasarflowai?schema=public"
```

### Step 3: Generate Prisma Client
```bash
npm run prisma:generate
```

Expected output:
```
✔ Generated Prisma Client
```

### Step 4: Create Database Migration
```bash
npm run prisma:migrate
```

When prompted for migration name, enter:
```
init_postgresql_schema
```

This will:
- Create all tables
- Set up indexes
- Configure foreign keys
- Apply constraints

### Step 5: Verify Database Schema
```bash
npm run prisma:studio
```

This opens a web interface at `http://localhost:5555` where you can:
- View all tables
- Check data
- Verify relationships

### Step 6: Start Development Server
```bash
npm run dev
```

### Step 7: Test the Application

1. **Test Login** - Go to `/login`
2. **Create Account** - Go to `/signup`
3. **Test Dashboard** - Go to `/`
4. **Test Lead Collection** - Go to `/leads`
5. **Test CRM** - Go to `/crmsystem`

## Troubleshooting

### Error: "Can't reach database server"
**Solution:** Verify your DATABASE_URL is correct and the PostgreSQL server is accessible.

### Error: "Prisma Client not generated"
**Solution:** Run `npm run prisma:generate`

### Error: "Migration failed"
**Solution:** 
1. Check if database exists
2. Verify user permissions
3. Run `npx prisma migrate reset` (⚠️ This deletes all data)

### Error: "Module not found: @prisma/client"
**Solution:** 
```bash
npm install @prisma/client
npm run prisma:generate
```

## What Changed?

### Database
- ✅ MongoDB → PostgreSQL
- ✅ Mongoose → Prisma ORM
- ✅ All models converted to Prisma schema
- ✅ Indexes preserved and optimized

### Code Structure
- ✅ New `lib/prisma.ts` for database client
- ✅ Updated `package.json` with Prisma scripts
- ✅ Prisma schema in `prisma/schema.prisma`

### API Routes (Being Updated)
All API routes are being migrated to use Prisma instead of Mongoose.

## Next Steps

After successful installation:

1. **Migrate Existing Data** (if you have MongoDB data):
   - Export from MongoDB
   - Transform to PostgreSQL format
   - Import using Prisma

2. **Update API Routes**:
   - All routes will be updated to use Prisma
   - No changes needed to frontend

3. **Test All Features**:
   - Authentication
   - Lead management
   - Email automation
   - Booking system

## Commands Reference

```bash
# Generate Prisma Client
npm run prisma:generate

# Create and apply migration
npm run prisma:migrate

# Deploy migrations (production)
npm run prisma:deploy

# Open Prisma Studio
npm run prisma:studio

# View migration status
npx prisma migrate status

# Reset database (⚠️ DELETES ALL DATA)
npx prisma migrate reset

# Format schema file
npx prisma format
```

## Support

If you encounter any issues:
1. Check the error message carefully
2. Verify DATABASE_URL connection
3. Ensure PostgreSQL server is running
4. Check Prisma documentation: https://www.prisma.io/docs
