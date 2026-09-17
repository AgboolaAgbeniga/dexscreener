const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // Prevent multiple instances of Prisma Client in development
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: process.env.PRISMA_LOG === 'true' ? ['query', 'error', 'warn'] : ['error']
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
