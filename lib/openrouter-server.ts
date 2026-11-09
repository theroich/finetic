import {
  OPENROUTER_MODELS_URL,
  type OpenRouterModel,
} from "./openrouter";

interface UpstreamOpenRouterModel {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    input_cache_read?: string | number;
  };
  reasoning?: {
    mandatory?: boolean;
    default_enabled?: boolean;
    supported_efforts?: string[];
    default_effort?: string;
  } | null;
  architecture?: {
    output_modalities?: string[];
  };
  supported_parameters?: string[];
}

interface UpstreamOpenRouterResponse {
  data?: UpstreamOpenRouterModel[];
}

function toNumber(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter catalog request failed with status ${response.status}`
    );
  }

  const payload = (await response.json()) as UpstreamOpenRouterResponse;
  const models = payload.data ?? [];

  return models
    .filter((model) => {
      const outputModalities = model.architecture?.output_modalities ?? [];
      const parameters = model.supported_parameters ?? [];
      const isTextModel = outputModalities.includes("text");
      const isChatModel =
        parameters.includes("max_tokens") ||
        parameters.includes("temperature");

      return (
        isTextModel &&
        isChatModel &&
        Boolean(model.id) &&
        Boolean(model.name)
      );
    })
    .map((model) => ({
      id: model.id as string,
      name: model.name as string,
      contextLength: model.context_length ?? 0,
      pricing: {
        prompt: toNumber(model.pricing?.prompt),
        completion: toNumber(model.pricing?.completion),
        inputCacheRead: toNumber(model.pricing?.input_cache_read),
      },
      reasoning: model.reasoning
        ? {
            mandatory: model.reasoning.mandatory === true,
            defaultEnabled: model.reasoning.default_enabled === true,
            supportedEfforts: model.reasoning.supported_efforts ?? [],
            defaultEffort: model.reasoning.default_effort ?? null,
          }
        : null,
    }));
}
