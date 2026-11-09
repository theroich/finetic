## Why

OpenRouter is already wired into the chat route, but the app still assumes a single model for everything. The three subtitle tools (`skipToSubtitleContent`, `explainScene`, `analyzeMedia`) hardcode `google("gemini-2.0-flash")`, so OpenRouter users without a Google key lose subtitle features. Reasoning models such as DeepSeek V4.1 Flash also spend their output budget thinking, which can leave those tools with empty responses.

We need explicit control over two OpenRouter models: a general chat model that may reason, and a dedicated subtitle model that runs without thinking effort. Users should be able to pick both from the OpenRouter catalog instead of typing model IDs by hand.

## What Changes

- Add an OpenRouter model catalog endpoint that proxies and caches `GET https://openrouter.ai/api/v1/models`, returning a slim payload with id, name, context length, pricing, and reasoning metadata.
- Replace the free-text OpenRouter chat model input with a searchable picker over the full OpenRouter text-model catalog.
- Add a second searchable picker for the three subtitle tools, filtered to OpenRouter models that can run without thinking effort:
  - models with no `reasoning` metadata, or
  - models with `reasoning.mandatory === false`.
  - Models with `reasoning.mandatory === true` are excluded.
- Add `openrouterSubtitleModel` to settings, persisted in `localStorage` and sent in the chat request body.
- Resolve two models in `/api/chat` when the provider is OpenRouter: `openrouterModel` for chat and `openrouterSubtitleModel` for subtitle tools. An empty subtitle model falls back to the chat model.
- Pass the resolved subtitle model into `createAllTools` and use it in the three subtitle tools instead of importing `@ai-sdk/google`.
- Disable reasoning for subtitle tool calls with `providerOptions.openrouter.reasoning.enabled = false`.
- Raise the subtitle tools' `maxOutputTokens` so non-thinking answers are not truncated, especially `analyzeMedia`.
- Return explicit errors when a subtitle tool produces empty text instead of returning `success: true` with an empty string.
- Capture `currentTimestamp` inside `explainScene` as a fallback so the chat model does not have to pass it correctly.

Non-OpenRouter providers keep their current behavior. The subtitle model selector is only shown when `aiProvider === "openrouter"`.

## Capabilities

### New Capabilities

- `openrouter-model-selection`: selection, eligibility, resolution, and request behavior for the general OpenRouter model and the dedicated no-thinking subtitle model.

### Modified Capabilities

<!-- No existing specs in openspec/specs/. -->

## Impact

- `app/api/chat/route.ts`: resolve chat and subtitle models; pass subtitle model to tools; remove API-key logging.
- `app/tools/index.ts`: accept a subtitle model and forward it to subtitle tool factories.
- `app/tools/subtitles.ts`: replace hardcoded Gemini model with the injected model; disable reasoning; raise output budgets; handle empty text.
- `contexts/settings-context.tsx`: add `openrouterSubtitleModel` state and persistence.
- `app/(main)/settings/page.tsx`: add searchable pickers for both OpenRouter models.
- `components/navigator/ai-ask.tsx`: send `openrouterSubtitleModel` in the request body.
- New `app/api/openrouter/models/route.ts`: cached catalog proxy with server-side filtering.
- `README.md` and `docker-compose.yml`: document `OPENROUTER_API_KEY` and the two-model setup.
- No database or Jellyfin API changes.
