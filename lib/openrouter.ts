export interface OpenRouterModelPricing {
  prompt: number;
  completion: number;
  inputCacheRead: number;
}

export interface OpenRouterReasoning {
  mandatory: boolean;
  defaultEnabled: boolean;
  supportedEfforts: string[];
  defaultEffort: string | null;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  contextLength: number;
  pricing: OpenRouterModelPricing;
  reasoning: OpenRouterReasoning | null;
}

export interface OpenRouterModelsResponse {
  models: OpenRouterModel[];
}

export const OPENROUTER_MODELS_URL =
  "https://openrouter.ai/api/v1/models";

export const SUBTITLE_CONTEXT_THRESHOLD = 100_000;

export function isSubtitleModelEligible(model: OpenRouterModel): boolean {
  return !model.reasoning || model.reasoning.mandatory !== true;
}

export function requiresReasoning(model: OpenRouterModel): boolean {
  return model.reasoning?.mandatory === true;
}

export function formatContextLength(contextLength: number): string {
  if (contextLength >= 1_000_000) {
    const millions = contextLength / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }

  if (contextLength >= 1_000) {
    return `${Math.round(contextLength / 1_000)}k`;
  }

  return `${contextLength}`;
}

export function formatPricing(pricing: OpenRouterModelPricing): string {
  const prompt = pricing.prompt * 1_000_000;
  const completion = pricing.completion * 1_000_000;

  if (prompt === 0 && completion === 0) {
    return "Free";
  }

  const format = (value: number) =>
    value < 0.01 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`;

  return `${format(prompt)} / ${format(completion)}`;
}
