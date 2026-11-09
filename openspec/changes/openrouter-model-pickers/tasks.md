## 1. OpenRouter catalog

- [x] 1.1 Define a shared `OpenRouterModel` type with `id`, `name`, `contextLength`, `pricing`, and `reasoning` fields.
- [x] 1.2 Add `app/api/openrouter/models/route.ts` that fetches `https://openrouter.ai/api/v1/models` with one-hour revalidation.
- [x] 1.3 Filter the upstream catalog to text-output chat models and map it to the slim payload.
- [x] 1.4 Return a structured error response when the upstream catalog cannot be fetched.
- [x] 1.5 Verify the endpoint returns eligible models and excludes embedding/rerank/non-text models.

## 2. Settings state and persistence

- [x] 2.1 Add `openrouterSubtitleModel` to `SettingsContextType` in `contexts/settings-context.tsx`.
- [x] 2.2 Add the `openrouterSubtitleModel` state, defaulting to an empty string.
- [x] 2.3 Load and save it under `finetic-openrouter-subtitle-model` in `localStorage`.
- [x] 2.4 Include `openrouterSubtitleModel` in the context provider value.
- [x] 2.5 Add `openrouterSubtitleModel` to the `/api/chat` request body in `components/navigator/ai-ask.tsx`.

## 3. General OpenRouter model picker

- [x] 3.1 Replace the free-text `openrouterModel` input in `app/(main)/settings/page.tsx` with a searchable picker fed by `/api/openrouter/models`.
- [x] 3.2 Show model name, ID, context length, and reasoning status for each option.
- [x] 3.3 Include reasoning and mandatory-reasoning models in the general picker.
- [x] 3.4 Preserve the existing `finetic-openrouter-model` value as the initial selection.
- [x] 3.5 Handle catalog loading and error states in the picker.

## 4. Subtitle model picker

- [x] 4.1 Add the subtitle model picker below the general picker, visible only when `aiProvider === "openrouter"`.
- [x] 4.2 Filter options to models with no `reasoning` metadata or `reasoning.mandatory === false`.
- [x] 4.3 Exclude models with `reasoning.mandatory === true`.
- [x] 4.4 Apply a default `contextLength >= 100000` filter with a "show all" toggle.
- [x] 4.5 Show an "inherit the Navigator model" empty state when no subtitle model is selected.
- [x] 4.6 Warn when the general model requires reasoning and no subtitle model is selected.
- [x] 4.7 Mark unavailable saved models and allow the user to choose another.

## 5. Server-side model resolution

- [x] 5.1 Extract the OpenRouter branch of the provider `switch` in `app/api/chat/route.ts` into a reusable `resolveOpenRouter(modelId)` helper.
- [x] 5.2 Read `openrouterSubtitleModel` from the request body.
- [x] 5.3 Resolve `chatModel` from `openrouterModel`.
- [x] 5.4 Resolve `subtitleModel` from `openrouterSubtitleModel` when present; otherwise reuse `chatModel`.
- [x] 5.5 Return a clear error when the subtitle model requires reasoning and no explicit subtitle model was provided.
- [x] 5.6 Remove API-key values from server logs in `app/api/chat/route.ts`.

## 6. Subtitle tool injection

- [x] 6.1 Change `createAllTools` in `app/tools/index.ts` to accept a subtitle model parameter.
- [x] 6.2 Forward the subtitle model to `skipToSubtitleContent`, `createExplainScene`, and `createAnalyzeMedia`.
- [x] 6.3 Remove the `@ai-sdk/google` import from `app/tools/subtitles.ts`.
- [x] 6.4 Use the injected model in all three `streamText` calls.
- [x] 6.5 Disable thinking with `providerOptions.openrouter.reasoning.enabled = false` on all three calls.
- [x] 6.6 Set `maxOutputTokens` to 512, 1024, and 2048 for `skipToSubtitleContent`, `explainScene`, and `analyzeMedia` respectively.
- [x] 6.7 Return `success: false` with a clear error when the model returns empty text.
- [x] 6.8 Capture `currentTimestamp` in `createExplainScene` and use it as the default when the tool argument is missing.

## 7. Documentation

- [x] 7.1 Document `OPENROUTER_API_KEY` and the two-model setup in `README.md`.
- [x] 7.2 Add a commented `OPENROUTER_API_KEY` entry to `docker-compose.yml`.
- [x] 7.3 Note that subtitle text is sent to OpenRouter when that provider is selected.

## 8. Verification

- [x] 8.1 Verify the general picker lists reasoning and non-reasoning models and saves the selection across reloads.
- [x] 8.2 Verify the subtitle picker excludes mandatory-reasoning models and honors the context filter.
- [ ] 8.3 With chat `deepseek/deepseek-v4.1-flash` and subtitles `openai/gpt-4.1-mini`, verify all 21 tools work.
- [ ] 8.4 With an empty subtitle model, verify the three subtitle tools use the chat model with thinking disabled.
- [x] 8.5 Verify non-OpenRouter providers hide the subtitle picker and keep current behavior.
- [x] 8.6 Verify subtitle tools return explicit errors instead of empty success responses.
- [x] 8.7 Verify no API key appears in server logs.

## 9. UI polish

- [x] 9.1 Fix the transparent model picker and provider select backgrounds, constrain the long model list with a fixed-height scroll area, and strengthen popover contrast.
