import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import { env } from "../env.js";
import { createSession } from "../shared/auth/session.service.js";
import { assignFreeSubscription } from "../shared/billing/subscription.repository.js";

/**
 * Development helper: mints a real user + session directly in PostgreSQL so the
 * auth middleware, cookies, Bearer tokens, and admin guard can be exercised
 * without a PeridotID `pid_code`. Never runs with NODE_ENV=production.
 */
const args = process.argv.slice(2);

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

function optionValue(flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function cleanupUser(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.activityLog.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.userSubscription.deleteMany({ where: { userId } });
    await tx.chatMessage.deleteMany({ where: { session: { userId } } });
    await tx.chatSession.deleteMany({ where: { userId } });
    await tx.trip.deleteMany({ where: { members: { some: { userId } } } });
    await tx.user.deleteMany({ where: { id: userId } });
  });
}

async function main(): Promise<void> {
  if (env.NODE_ENV === "production") {
    console.error("dev-session tidak boleh dijalankan saat NODE_ENV=production.");
    process.exitCode = 1;
    return;
  }

  if (hasFlag("--cleanup")) {
    const userId = optionValue("--cleanup");
    if (!userId) {
      console.error("Pemakaian: pnpm --filter api dev:session -- --cleanup <userId>");
      process.exitCode = 1;
      return;
    }
    await cleanupUser(userId);
    console.log(`User uji ${userId} beserta sesi dan langganannya dihapus.`);
    return;
  }

  const suffix = randomUUID();
  const slug = suffix.replace(/-/g, "").slice(0, 12).toLowerCase();
  const user = await prisma.user.create({
    data: {
      name: `Dev Session ${suffix.slice(0, 8)}`,
      username: `dev_${slug}`,
      email: `dev-${suffix}@example.test`,
      role: hasFlag("--admin") ? "admin" : "user",
      isActive: !hasFlag("--inactive"),
    },
    select: { id: true, name: true, username: true, email: true, role: true, isActive: true },
  });

  await assignFreeSubscription(user.id);
  const session = await createSession(user.id, { userAgent: "dev-session-script" });
  const baseUrl = `http://localhost:${env.PORT}`;

  console.log(
    JSON.stringify(
      { user, token: session.token, expiresAt: session.expiresAt },
      null,
      2,
    ),
  );
  console.log("\nContoh Bearer:");
  console.log(`  curl.exe -i ${baseUrl}/api/v1/auth/me -H "Authorization: Bearer ${session.token}"`);
  console.log("\nContoh cookie:");
  console.log(`  curl.exe -i ${baseUrl}/api/v1/auth/me -H "Cookie: lahlah_session=${session.token}"`);
  console.log("\nBersihkan data uji:");
  console.log(`  pnpm --filter api dev:session -- --cleanup ${user.id}`);
}

await main();
await prisma.$disconnect();
