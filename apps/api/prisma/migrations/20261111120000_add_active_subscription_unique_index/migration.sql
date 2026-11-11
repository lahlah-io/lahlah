-- At most one active subscription per user. Canceled/expired/pending rows are
-- excluded so the full history is preserved while the active entitlement stays
-- unambiguous. Application code expires overdue rows before creating a new one.
CREATE UNIQUE INDEX "user_subscriptions_active_user_key"
    ON "user_subscriptions" ("user_id")
    WHERE "status" = 'active';
