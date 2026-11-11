import { prisma } from "../db/client.js";
import { expireOverdueSubscriptions } from "../shared/billing/subscription.repository.js";

/**
 * Maintenance job: `active` subscriptions whose `expiresAt` has passed become
 * `expired`. Request paths do this lazily per user, but a scheduled run keeps
 * admin lists and reporting accurate for users who never sign in.
 */
const result = await expireOverdueSubscriptions();
console.log(`Expired ${result.count} overdue subscription(s).`);
await prisma.$disconnect();
