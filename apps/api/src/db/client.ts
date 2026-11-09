import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../env.js";

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };
const log: ("warn" | "error")[] = env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }), log });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
