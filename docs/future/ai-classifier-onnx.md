# AI Classifier ONNX (Future)

## Status
MVP uses rule-based intent hints plus a model-based classifier call (`AI_CLASSIFIER_MODEL`) through the OpenAI-compatible integration. ONNX is **not** part of MVP.

## Migration boundary
ONNX may replace **only** the classifier/intent stage. It must not replace tool execution, DB access, itinerary validation, draft generation, or final confirmation. Tool calls remain backend-controlled and continue to query `destinations` from PostgreSQL via repositories.

## Requirements before migration
- Labeled dataset per intent: `general_chat`, `generate_itinerary`, `modify_itinerary`, `regenerate_itinerary`, `confirm_itinerary`, `missing_information`.
- Include Indonesian natural-language variants, greetings, ambiguous requests, and unsafe/invalid confirmation phrasing.
- Evaluate per-intent precision/recall and confusion matrix; track low-confidence and out-of-scope behavior.
- Define confidence threshold and fallback: unknown, invalid output, low confidence, or runtime failure -> `missing_information` (never dangerous tool execution, never itinerary write).
- Validate `confirm_itinerary` handling: classifier may only flag intent; backend confirm endpoint must still require explicit `draftId` + ownership + draft revalidation.

## Decision criteria
Migrate when ONNX classifier meets quality targets, reduces latency/cost versus API classifier, and preserves the safety fallback contract. Keep a runtime switch to roll back to the model classifier if needed.
