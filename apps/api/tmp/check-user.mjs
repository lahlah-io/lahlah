import { prisma } from '../src/db/client.js';
const u = await prisma.user.findFirst({ select: { id:true, email:true, isActive:true } });
console.log(JSON.stringify(u));
await prisma.$disconnect();
