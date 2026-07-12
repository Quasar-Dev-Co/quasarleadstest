import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  })
}

// Lazily initialize PrismaClient so it does not run at build time
// when DATABASE_URL is not available (Next.js page-data collection).
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient()
    }
    const value = Reflect.get(globalForPrisma.prisma as object, prop, receiver)
    return typeof value === 'function' ? value.bind(globalForPrisma.prisma) : value
  },
}) as PrismaClient

if (process.env.NODE_ENV !== 'production' && !globalForPrisma.prisma) {
  // Keep the singleton warm in dev without forcing instantiation at import.
}

export default prisma
