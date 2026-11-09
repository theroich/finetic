"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  formatContextLength,
  formatPricing,
  SUBTITLE_CONTEXT_THRESHOLD,
  type OpenRouterModel,
} from "@/lib/openrouter";

interface OpenRouterModelPickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  models: OpenRouterModel[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  filter?: (model: OpenRouterModel) => boolean;
  showContextFilter?: boolean;
}

function reasoningLabel(model: OpenRouterModel): string {
  if (!model.reasoning) {
    return "No thinking";
  }

  return model.reasoning.mandatory ? "Thinking required" : "Thinking optional";
}

function reasoningClassName(model: OpenRouterModel): string {
  if (!model.reasoning) {
    return "text-emerald-600 dark:text-emerald-400";
  }

  return model.reasoning.mandatory
    ? "text-destructive"
    : "text-amber-600 dark:text-amber-400";
}

export function OpenRouterModelPicker({
  id,
  value,
  onChange,
  models,
  loading,
  error,
  onRetry,
  placeholder = "Select a model",
  allowEmpty = false,
  emptyLabel = "Use the Navigator model",
  filter,
  showContextFilter = false,
}: OpenRouterModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAllContexts, setShowAllContexts] = useState(false);

  const selected = useMemo(
    () => models.find((model) => model.id === value),
    [models, value]
  );

  const selectedEligible = selected ? (!filter || filter(selected)) : false;
  const invalidSelection =
    Boolean(value) &&
    !loading &&
    models.length > 0 &&
    (!selected || !selectedEligible);

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return models
      .filter((model) => (filter ? filter(model) : true))
      .filter((model) =>
        showContextFilter && !showAllContexts
          ? model.contextLength >= SUBTITLE_CONTEXT_THRESHOLD
          : true
      )
      .filter((model) =>
        normalizedQuery
          ? model.id.toLowerCase().includes(normalizedQuery) ||
            model.name.toLowerCase().includes(normalizedQuery)
          : true
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filter, models, query, showAllContexts, showContextFilter]);

  const triggerLabel = value
    ? selected
      ? selected.name
      : loading || models.length === 0
        ? value
        : `Unavailable: ${value}`
    : allowEmpty
      ? emptyLabel
      : placeholder;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between bg-background font-normal dark:bg-popover!",
            invalidSelection && "border-destructive/50 text-destructive"
          )}
          style={{ backgroundColor: "var(--popover)" }}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="flex max-h-[min(480px,60vh)] w-[min(560px,calc(100vw-2rem))] flex-col p-0 shadow-xl ring-1 ring-border/60"
        align="start"
      >
        <div className="shrink-0 space-y-2 border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by model name or ID..."
              className="pl-8"
              autoFocus
            />
          </div>

          {showContextFilter && (
            <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
              <span>
                Only models with at least{" "}
                {formatContextLength(SUBTITLE_CONTEXT_THRESHOLD)} context
              </span>
              <Switch
                checked={!showAllContexts}
                onCheckedChange={(checked) => setShowAllContexts(!checked)}
              />
            </div>
          )}
        </div>

        {invalidSelection && (
          <div className="shrink-0 border-b bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {selected
              ? "This saved model requires thinking and is not eligible for subtitle tools. Select another model."
              : "This saved model is not in the current OpenRouter catalog. Select another model."}
          </div>
        )}

        <ScrollArea className="h-[min(360px,calc(60vh-110px))] overflow-hidden">
          <div className="p-1">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    value ? "opacity-0" : "opacity-100"
                  )}
                />
                <span>{emptyLabel}</span>
              </button>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading OpenRouter models...
              </div>
            )}

            {!loading && error && (
              <div className="space-y-2 px-2 py-4 text-sm">
                <p className="text-destructive">{error}</p>
                {onRetry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void onRetry()}
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}

            {!loading && !error && filteredModels.length === 0 && (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                No models match your search.
              </div>
            )}

            {!loading &&
              !error &&
              filteredModels.map((model) => {
                const isSelected = model.id === value;

                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onChange(model.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-sm px-2 py-2 text-left hover:bg-accent",
                      isSelected && "bg-accent"
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {model.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {model.id}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground">
                      <span className="block">
                        {formatContextLength(model.contextLength)} ctx
                      </span>
                      <span className="block">
                        {formatPricing(model.pricing)}
                      </span>
                      <span
                        className={cn(
                          "block",
                          reasoningClassName(model)
                        )}
                      >
                        {reasoningLabel(model)}
                      </span>
                    </span>
                  </button>
                );
              })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
