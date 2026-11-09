# openrouter-model-selection Specification

## Purpose
TBD - created by archiving change openrouter-model-pickers. Update Purpose after archive.
## Requirements
### Requirement: OpenRouter model catalog

The system SHALL expose a cached catalog of OpenRouter text chat models for use by the settings pickers.

The catalog SHALL be served by `GET /api/openrouter/models`, SHALL be cached for at least one hour, and SHALL return a slim payload containing `id`, `name`, `contextLength`, `pricing`, and `reasoning` for each model.

The catalog SHALL include only models whose output modalities include text and that expose chat-style parameters (`max_tokens` or `temperature`).

#### Scenario: Catalog is fetched and filtered

- **WHEN** the settings page requests the OpenRouter catalog
- **THEN** the system returns text chat models with id, name, context length, pricing, and reasoning metadata
- **AND** the response excludes embedding, rerank, and non-text-output models

#### Scenario: Catalog is cached

- **WHEN** two catalog requests occur within the cache window
- **THEN** the system serves the cached catalog without a second upstream request

#### Scenario: Catalog upstream is unavailable

- **WHEN** the OpenRouter catalog cannot be fetched
- **THEN** the endpoint returns an error response that the picker can display
- **AND** the rest of the settings page remains usable

---

### Requirement: General OpenRouter model picker

When the active AI provider is OpenRouter, the settings page SHALL present a searchable picker for the general chat model.

The picker SHALL list all eligible OpenRouter text chat models from the catalog, including reasoning and mandatory-reasoning models. Each option SHALL display the model name, model ID, context length, and reasoning status.

The selected model SHALL be persisted and used for the chat stream.

#### Scenario: User selects a general model

- **WHEN** the user selects `deepseek/deepseek-v4.1-flash` in the general model picker
- **THEN** the setting is saved to `localStorage`
- **AND** the next chat request uses that model

#### Scenario: Reasoning model is selectable as the general model

- **WHEN** the general model picker lists a model with `reasoning.mandatory === true`
- **THEN** that model is selectable
- **AND** it is marked as requiring reasoning

#### Scenario: Picker is searchable

- **WHEN** the user types part of a model name or ID
- **THEN** the picker filters the catalog to matching models

---

### Requirement: Subtitle model picker and eligibility

When the active AI provider is OpenRouter, the settings page SHALL present a second searchable picker for the model used by `skipToSubtitleContent`, `explainScene`, and `analyzeMedia`.

The subtitle picker SHALL include only models that can run without thinking effort:

- models with no `reasoning` metadata, or
- models with `reasoning.mandatory === false`.

The subtitle picker SHALL exclude models with `reasoning.mandatory === true`.

By default, the subtitle picker SHALL include only models with `contextLength >= 100000`. The user SHALL be able to relax this filter to show all otherwise eligible models.

#### Scenario: Mandatory-reasoning model is excluded

- **WHEN** the catalog contains a model with `reasoning.mandatory === true`
- **THEN** that model does not appear in the subtitle picker
- **AND** it may still appear in the general model picker

#### Scenario: Non-reasoning model is eligible

- **WHEN** the catalog contains `openai/gpt-4.1-mini` with no `reasoning` metadata
- **THEN** it appears in the subtitle picker

#### Scenario: Disableable reasoning model is eligible

- **WHEN** the catalog contains `google/gemini-2.5-flash` with `reasoning.mandatory === false`
- **THEN** it appears in the subtitle picker
- **AND** it is marked as reasoning-capable but disableable

#### Scenario: Context filter is applied by default

- **WHEN** an eligible model has `contextLength` below 100000
- **THEN** it is hidden by default
- **AND** it becomes visible when the user enables "show all"

---

### Requirement: Subtitle model inheritance and guardrail

If the user does not select a subtitle model, the system SHALL use the general OpenRouter model for the three subtitle tools, with thinking disabled.

If the general model requires reasoning (`reasoning.mandatory === true`) and no subtitle model is selected, the settings page SHALL warn the user and the chat route SHALL return a clear error when a subtitle tool is invoked.

#### Scenario: Empty subtitle model inherits the chat model

- **WHEN** the general model is `deepseek/deepseek-v4.1-flash` and the subtitle model is empty
- **THEN** the three subtitle tools use `deepseek/deepseek-v4.1-flash`
- **AND** reasoning is disabled for those calls

#### Scenario: Mandatory-reasoning general model without a subtitle model

- **WHEN** the general model has `reasoning.mandatory === true` and the subtitle model is empty
- **THEN** the settings page shows a warning
- **AND** a subtitle tool invocation returns an explicit error instead of silently using a thinking model

---

### Requirement: Two-model resolution

When the active AI provider is OpenRouter and a subtitle model is selected, the chat stream SHALL use the general model and the three subtitle tools SHALL use the subtitle model.

When the active AI provider is not OpenRouter, the three subtitle tools SHALL use the same model as the chat stream.

#### Scenario: Chat and subtitle tools use different models

- **WHEN** the general model is `deepseek/deepseek-v4.1-flash` and the subtitle model is `openai/gpt-4.1-mini`
- **THEN** the chat stream uses DeepSeek
- **AND** `skipToSubtitleContent`, `explainScene`, and `analyzeMedia` use GPT-4.1 mini

#### Scenario: Non-OpenRouter provider uses one model

- **WHEN** the active provider is Gemini
- **THEN** the subtitle model picker is not shown
- **AND** the three subtitle tools use the Gemini chat model

---

### Requirement: Subtitle tool binding and no thinking effort

The three subtitle tools SHALL receive the resolved subtitle model as an injected dependency and SHALL NOT import a provider-specific model.

When the active provider is OpenRouter, every subtitle tool call SHALL disable thinking with `providerOptions.openrouter.reasoning.enabled = false`.

The subtitle model SHALL NOT be required to support tool calling.

#### Scenario: Subtitle tools use the injected model

- **WHEN** `createAllTools` is called with a subtitle model
- **THEN** `skipToSubtitleContent`, `explainScene`, and `analyzeMedia` pass that model to their internal `streamText` calls
- **AND** no subtitle tool imports `@ai-sdk/google`

#### Scenario: Thinking is disabled

- **WHEN** an OpenRouter subtitle tool call is made
- **THEN** the request includes `reasoning.enabled = false`
- **AND** the tool does not rely on the model's default reasoning behavior

#### Scenario: Subtitle model without tool calling works

- **WHEN** the selected subtitle model supports text generation but not tool calling
- **THEN** the three subtitle tools still work
- **AND** the chat model remains responsible for tool calling

---

### Requirement: Subtitle output safety

The three subtitle tools SHALL use output budgets large enough for their answers without thinking tokens:

- `skipToSubtitleContent`: at least 512 output tokens
- `explainScene`: at least 1024 output tokens
- `analyzeMedia`: at least 2048 output tokens

Each tool SHALL verify that the model produced non-empty text. If the text is empty, the tool SHALL return `success: false` with a clear error.

`explainScene` SHALL use the playback timestamp captured at tool creation as a fallback when the chat model does not provide `currentTimestamp`.

#### Scenario: analyzeMedia returns a non-empty answer

- **WHEN** the user asks "What is this movie about?" with an eligible subtitle model
- **THEN** `analyzeMedia` returns a non-empty answer
- **AND** the answer is not truncated by the output budget

#### Scenario: Empty model response is reported

- **WHEN** a subtitle tool receives empty text from the model
- **THEN** the tool returns `success: false`
- **AND** the error explains that the model returned no content

#### Scenario: explainScene uses the captured timestamp

- **WHEN** the chat model omits `currentTimestamp` in the `explainScene` call
- **THEN** the tool uses the timestamp captured at tool creation
- **AND** analyzes subtitles around the actual playback position

---

### Requirement: Settings persistence and request transport

The selected general and subtitle OpenRouter models SHALL be persisted in `localStorage` and included in the `/api/chat` request body.

The general model SHALL use the existing `finetic-openrouter-model` key. The subtitle model SHALL use `finetic-openrouter-subtitle-model`.

The request body SHALL include `openrouterModel` and `openrouterSubtitleModel`.

#### Scenario: Settings survive a reload

- **WHEN** the user selects a general model and a subtitle model and reloads the page
- **THEN** both pickers show the previously selected models

#### Scenario: Request body carries both models

- **WHEN** the user sends a chat message while OpenRouter is active
- **THEN** the request body includes `openrouterModel` and `openrouterSubtitleModel`
- **AND** an empty subtitle model is transmitted as an empty value or omitted

---

### Requirement: Error handling

The system SHALL return clear, user-visible errors for OpenRouter configuration failures, including a missing API key, an unavailable catalog, an invalid subtitle model, and a subtitle model that requires reasoning.

#### Scenario: Missing OpenRouter key

- **WHEN** OpenRouter is selected and neither a user key nor `OPENROUTER_API_KEY` is available
- **THEN** the chat request returns a clear configuration error
- **AND** the error is not logged with the API key value

#### Scenario: Invalid subtitle model

- **WHEN** the saved subtitle model is no longer present in the catalog
- **THEN** the picker marks it as unavailable
- **AND** the user can select another eligible model

#### Scenario: API keys are not logged

- **WHEN** a chat request is processed
- **THEN** the server does not print `OPENROUTER_API_KEY` or any user-provided key to the logs

