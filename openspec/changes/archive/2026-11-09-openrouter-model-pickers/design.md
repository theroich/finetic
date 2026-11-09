## Context

Finetic already uses two language models, but only one is configurable. The chat model is resolved by a `switch` in `app/api/chat/route.ts`; the three subtitle tools import `google("gemini-2.0-flash")` directly in `app/tools/subtitles.ts`. When the user selects OpenRouter without a Google key, chat and media tools work but subtitle tools fail. When the user selects a reasoning model such as DeepSeek V4.1 Flash, the subtitle tools' small `maxOutputTokens` budgets can be consumed by thinking, producing empty text.

OpenRouter exposes a public model catalog at `GET https://openrouter.ai/api/v1/models` with per-model `reasoning` metadata. This lets the app distinguish models that never think from models that can disable thinking and models that require it.

## Goals / Non-Goals

**Goals:**

- Let OpenRouter users choose two models: a general chat model and a dedicated model for `skipToSubtitleContent`, `explainScene`, and `analyzeMedia`.
- Restrict the subtitle model picker to OpenRouter models that can run without thinking effort.
- Ensure subtitle tool calls never use thinking, even when the selected subtitle model is reasoning-capable.
- Replace free-text OpenRouter model IDs with searchable pickers backed by the OpenRouter catalog.
- Keep non-OpenRouter providers and all 18 non-LLM tools unchanged.

**Non-Goals:**

- Per-tool model overrides (`skip` vs `explain` vs `analyze`).
- Cross-provider subtitle models (e.g. OpenRouter chat + Google Gemini subtitles).
- RAG, chunking, or incremental summarization of subtitles.
- A capability registry for every provider.
- Automatic fallback between providers.

## Decisions

### 1. Two OpenRouter slots, not a generic model registry

Add `openrouterModel` (already exists) and `openrouterSubtitleModel` (new). Both are OpenRouter model IDs. The subtitle slot is only shown when `aiProvider === "openrouter"`.

**Why:** the user's requirement is scoped to OpenRouter. A full provider/model registry is more flexible but adds UI, resolution, and validation work that is not needed to fix the subtitle tools. The existing `switch` stays, with a small `resolveOpenRouter(modelId)` helper used twice.

**Alternative considered:** a generic `subtitleProvider` + `subtitleModel` pair. Rejected because it adds cross-provider key handling and UI that the current requirement does not need.

### 2. Subtitle model eligibility: no reasoning or disableable reasoning

A model is eligible for the subtitle picker when:

```
model.reasoning == null
  OR model.reasoning.mandatory == false
```

Models with `reasoning.mandatory == true` are excluded. The picker also filters to text-output, chat-capable models and, by default, `context_length >= 100_000`; a "show all" toggle can relax the context filter.

**Why:** `analyzeMedia` sends the full subtitle transcript. A 32k-context model would fail. The 100k threshold covers feature-length subtitles while still leaving hundreds of eligible models. `reasoning == null` models are the simplest "no thinking" case; `mandatory == false` models such as `google/gemini-2.5-flash` can be used with thinking explicitly disabled.

**Alternative considered:** only models with no `reasoning` metadata. Rejected because it excludes Gemini Flash-style models that the user may want.

Note: `google/gemini-2.0-flash` is not present in the OpenRouter catalog. The closest Gemini Flash option is `google/gemini-2.5-flash`, which is eligible because `reasoning.mandatory === false`. Using the Google provider's Gemini 2.0 Flash directly would be a cross-provider change and is out of scope.

### 3. Disable reasoning explicitly on subtitle calls

All three subtitle tools call `streamText` with:

```ts
providerOptions: {
  openrouter: {
    reasoning: { enabled: false },
  },
},
```

The option is sent for OpenRouter subtitle calls regardless of whether the selected model declares reasoning. OpenRouter treats `reasoning` as a gateway-level parameter and non-reasoning models ignore it. If validation shows that a non-reasoning model rejects the parameter, the implementation will conditionally omit it using the catalog metadata.

**Why:** relying on a model's default behavior is not enough; DeepSeek V4.1 Flash defaults to `reasoning.enabled = true` at `high` effort. Explicitly disabling it makes the "no thinking" guarantee real.

### 4. Empty subtitle model inherits the chat model, with a guardrail

If `openrouterSubtitleModel` is empty, the subtitle tools use `openrouterModel` with thinking disabled. If the chat model is mandatory-reasoning, the UI shows a warning and the server returns a clear error if the user tries to run a subtitle tool.

**Why:** this preserves current single-model behavior and works for DeepSeek, whose reasoning can be disabled. It avoids a hardcoded default model that could become deprecated.

**Alternative considered:** default the subtitle model to a fixed non-thinking model. Rejected because it hides a model choice the user explicitly wants to control.

### 5. One catalog endpoint, filtered on the client

Add `GET /api/openrouter/models`. It fetches the OpenRouter catalog with `next: { revalidate: 3600 }`, keeps text-output chat models, and returns a slim payload:

```
{ id, name, contextLength, pricing, reasoning }
```

Both pickers consume the same payload. The general picker shows all models. The subtitle picker applies the eligibility and context filters.

**Why:** the raw catalog is ~830 KB. A server proxy reduces the payload, caches it, and keeps filtering rules in one place. Client-side filtering lets both pickers share one request.

**Alternative considered:** fetching the public catalog directly from the browser (CORS is allowed). Rejected because of payload size and duplicated filtering logic.

### 6. Inject a `LanguageModel` into the tools

`createAllTools(currentMedia, currentTimestamp, subtitleModel)` passes the resolved model to the three subtitle factories. `subtitles.ts` no longer imports `@ai-sdk/google`.

**Why:** this is the smallest change that makes the tools provider-agnostic. The tools do not need to know about OpenRouter, keys, or settings.

### 7. Raise output budgets and handle empty text

Because thinking is disabled for subtitle calls, the budgets are purely visible output. Use:

```
skipToSubtitleContent   maxOutputTokens: 512
explainScene            maxOutputTokens: 1024
analyzeMedia            maxOutputTokens: 2048
```

Each tool checks that the resulting text is non-empty and returns `success: false` with a clear error otherwise.

**Why:** the old 100/300/500 budgets were tuned for Gemini Flash and are tight for `analyzeMedia` even without reasoning. Silent empty responses are worse than explicit errors.

### 8. Close over `currentTimestamp` in `explainScene`

`createExplainScene(currentMedia, currentTimestamp, subtitleModel)` uses the captured timestamp as the default. The tool schema keeps `currentTimestamp` optional.

**Why:** the chat model should not be trusted to pass the playback position correctly. This is a small robustness fix that benefits every provider.

## Risks / Trade-offs

- **`reasoning.enabled: false` rejected by a non-reasoning model** → validate with `openai/gpt-4.1-mini`; if rejected, omit the parameter using the model's catalog metadata.
- **Subtitle model context too small for a long transcript** → default picker filter `context_length >= 100_000`; show a warning for smaller models under "show all".
- **Chat model requires reasoning and subtitle model is empty** → UI warning plus a server error; the user must choose a subtitle model.
- **Reasoning round-trip in multi-turn tool calls with provider 1.1.2** → test "play X" followed by "skip to..." in one conversation; if it fails, upgrade `@openrouter/ai-sdk-provider` to `1.5.4`.
- **Catalog drift or deprecation** → cache for one hour; if a saved model disappears, the picker shows it as unavailable and the user can choose another.
- **Two models mean two cost lines** → the picker shows pricing; the subtitle model is expected to be cheaper and non-thinking.
- **Subtitle text is sent to OpenRouter** → this is already true for chat; document that subtitle analysis leaves the local network when OpenRouter is selected.
- **Provider version 1.1.2 may not preserve reasoning details across tool calls** → keep the upgrade to 1.5.4 as a contingency, not a prerequisite.

## Migration Plan

- No database or API migration.
- Add `finetic-openrouter-subtitle-model` to `localStorage`; absence means "inherit the chat model".
- Existing `finetic-openrouter-model` values remain valid.
- Non-OpenRouter users see no UI change.
- Rollback: remove the subtitle picker and fall back to the chat model; the tools still accept the injected model.

## Open Questions

- None blocking. The only implementation spike is whether OpenRouter accepts `reasoning.enabled: false` for models without reasoning metadata; the fallback is to omit the parameter based on catalog metadata.
