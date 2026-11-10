import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGroq } from "@ai-sdk/groq";
import { createOllama } from "ai-sdk-ollama";
import { convertToModelMessages, streamText, stepCountIs } from "ai";
import { createAllTools, createSystemPrompt } from "@/app/tools";
import { fetchOpenRouterModels } from "@/lib/openrouter-server";
import { cookies } from "next/headers";

async function getAuthData() {
  const cookieStore = await cookies();
  const authData = cookieStore.get("jellyfin-auth");

  if (!authData?.value) {
    throw new Error("Not authenticated");
  }

  const parsed = JSON.parse(authData.value);
  return { serverUrl: parsed.serverUrl, user: parsed.user };
}

function resolveOpenRouterModel(modelId: string, apiKey?: string) {
  // Trim keys: a leading/trailing space produces an invalid
  // "Authorization: Bearer  ..." header that OpenRouter rejects with
  // "Missing Authentication header".
  const normalizedKey = apiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();

  if (normalizedKey) {
    return createOpenRouter({ apiKey: normalizedKey }).chat(modelId);
  }

  throw new Error(
    "OpenRouter API key is required for OpenRouter provider. Please set your API key in settings or OPENROUTER_API_KEY."
  );
}

export async function POST(req: Request) {
  try {
    await getAuthData();

    const {
      messages,
      currentMedia,
      currentTimestamp,
      aiProvider = "gemini",
      ollamaBaseUrl = "http://localhost:11434",
      ollamaModel = "phi3",
      groqModel = "llama3-8b-8192",
      openrouterModel = "deepseek/deepseek-v4.1-flash",
      openrouterSubtitleModel = "",
      googleApiKey,
      groqApiKey,
      openrouterApiKey,
    } = await req.json();

    const normalizedGoogleApiKey = googleApiKey?.trim();
    const normalizedGroqApiKey = groqApiKey?.trim();
    const envGoogleApiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    const envGroqApiKey = process.env.GROQ_API_KEY?.trim();

    let model;
    let subtitleModel;
    let subtitleConfigError: string | undefined;

    switch (aiProvider) {
      case "gemini":
        if (normalizedGoogleApiKey) {
          const googleProvider = createGoogleGenerativeAI({
            apiKey: normalizedGoogleApiKey,
          });
          model = googleProvider("gemini-2.0-flash");
        } else if (envGoogleApiKey) {
          model = createGoogleGenerativeAI({
            apiKey: envGoogleApiKey,
          })("gemini-2.0-flash");
        } else {
          throw new Error(
            "Google API key is required for Gemini provider. Please set your API key in settings."
          );
        }
        break;
      case "ollama": {
        const ollamaProvider = createOllama({
          baseURL: ollamaBaseUrl,
        });
        model = ollamaProvider(ollamaModel);
        break;
      }
      case "groq":
        if (normalizedGroqApiKey) {
          const groqProvider = createGroq({
            apiKey: normalizedGroqApiKey,
          });
          model = groqProvider(groqModel);
        } else if (envGroqApiKey) {
          model = createGroq({
            apiKey: envGroqApiKey,
          })(groqModel);
        } else {
          throw new Error(
            "Groq API key is required for Groq provider. Please set your API key in settings."
          );
        }
        break;
      case "openrouter": {
        model = resolveOpenRouterModel(openrouterModel, openrouterApiKey);

        if (openrouterSubtitleModel) {
          subtitleModel = resolveOpenRouterModel(
            openrouterSubtitleModel,
            openrouterApiKey
          );

          try {
            const catalog = await fetchOpenRouterModels();
            const subtitleModelInfo = catalog.find(
              (entry) => entry.id === openrouterSubtitleModel
            );

            if (!subtitleModelInfo) {
              subtitleConfigError =
                "The selected subtitle model is not available in the OpenRouter catalog. Choose another model.";
            } else if (subtitleModelInfo.reasoning?.mandatory) {
              subtitleConfigError =
                "The selected subtitle model requires thinking. Choose a model that can run without thinking effort.";
            }
          } catch (catalogError) {
            console.warn(
              "Could not validate the OpenRouter subtitle model:",
              catalogError
            );
          }
        } else {
          subtitleModel = model;

          try {
            const catalog = await fetchOpenRouterModels();
            const chatModelInfo = catalog.find(
              (entry) => entry.id === openrouterModel
            );

            if (chatModelInfo?.reasoning?.mandatory) {
              subtitleConfigError =
                "The selected Navigator model requires thinking. Choose a subtitle model that can run without thinking effort.";
            }
          } catch (catalogError) {
            console.warn(
              "Could not validate the OpenRouter subtitle model:",
              catalogError
            );
          }
        }
        break;
      }
      default:
        if (envGoogleApiKey) {
          model = createGoogleGenerativeAI({
            apiKey: envGoogleApiKey,
          })("gemini-2.0-flash");
        } else {
          throw new Error("No API key configured for the selected provider.");
        }
    }

    const result = streamText({
      model,
      messages: convertToModelMessages(messages),
      stopWhen: stepCountIs(10),
      abortSignal: req.signal,
      tools: createAllTools(
        currentMedia,
        currentTimestamp,
        subtitleModel ?? model,
        subtitleConfigError
      ),
      system: createSystemPrompt(currentMedia, currentTimestamp),
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        const message =
          error instanceof Error ? error.message : String(error);

        if (/missing auth(?:entication|enticate) header/i.test(message)) {
          return "The AI provider rejected the request because the API key is missing or malformed. Check the API key in Settings (remove any leading/trailing spaces) or the server environment variable.";
        }

        return message;
      },
    });
  } catch (error) {
    console.error("Chat API Error:", error);

    if (error instanceof Error && error.message === "Not authenticated") {
      return new Response("Unauthorized", { status: 401 });
    }

    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return new Response(message, { status: 500 });
  }
}
