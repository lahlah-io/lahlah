# AI Cost and Rate Limit (Future)

## Not in MVP
MVP does not enforce per-user AI quotas, detailed token-cost accounting, or production-grade AI observability. Provider usage is captured only when the integration normalizer exposes it.

## Planned controls
- **Per-user quotas:** limit chat messages, tool rounds, and itinerary generations per user/session/day.
- **Token/cost tracking:** persist provider/model, prompt/completion tokens, estimated cost, and request latency in `chat_messages.metadata` or a dedicated usage table.
- **Timeouts:** bound classifier, tool-model, and total orchestration time; return controlled errors (`AI_UPSTREAM_ERROR`/timeout) without partial itinerary writes.
- **Rate limiting:** apply API-level and AI-provider-level limits; backoff/retry only for safe idempotent reads, never for confirmation side effects.
- **Observability:** structured logs with request IDs, session IDs, model IDs, tool names (no secrets, no full sensitive prompts by default), latency, finish reason, and error codes.
- **Budget guardrails:** max rounds (`AI_TOOL_MAX_ROUNDS`), max candidates, and capped destination fields already reduce blast radius; add provider budget alerts before scaling.

## Safety
Rate-limit and timeout failures must not confirm drafts or create `itinerary` rows. Errors must use the API error envelope.
