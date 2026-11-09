"use client";

import { useCallback, useEffect, useState } from "react";
import type { OpenRouterModel } from "@/lib/openrouter";

interface UseOpenRouterModelsResult {
  models: OpenRouterModel[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useOpenRouterModels(
  enabled: boolean
): UseOpenRouterModelsResult {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/openrouter/models", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        models?: OpenRouterModel[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? "Failed to load OpenRouter models."
        );
      }

      setModels(payload.models ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load OpenRouter models."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || models.length > 0) {
      return;
    }

    void load();
  }, [enabled, load, models.length]);

  return { models, loading, error, reload: load };
}
