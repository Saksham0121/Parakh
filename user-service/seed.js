const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function seed() {
  const hash = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@parakh.com' },
    update: {},
    create: {
      email: 'admin@parakh.com',
      passwordHash: hash
    }
  });
  console.log('Test user seeded: admin@parakh.com / password123');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
