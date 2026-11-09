import { streamText, tool, type LanguageModel } from "ai";
import { z } from "zod";
import { getSubtitleContent } from "@/app/actions/subtitles";
import { convertTimestampToSeconds } from "@/lib/utils";

const SUBTITLE_PROVIDER_OPTIONS = {
  openrouter: {
    reasoning: { enabled: false },
  },
} as const;

export interface SkipToSubtitleContent {
  success: boolean;
  action: "skipTo";
  timestamp: number;
  timestampFormatted: string;
  text: string;
  message: string;
  error?: string;
}

export const skipToSubtitleContent = (
  currentMedia: any,
  subtitleModel: LanguageModel,
  subtitleConfigError?: string
) =>
  tool({
    description:
      "Analyze subtitles and find the best timestamp to skip to based on the user's description. Only works when media is currently playing.",
    inputSchema: z.object({
      userDescription: z
        .string()
        .describe(
          "The user's description of what scene/moment they want to skip to"
        ),
      subtitleIndex: z
        .number()
        .optional()
        .describe("The subtitle stream index (default: 0)"),
    }),
    execute: async ({ userDescription, subtitleIndex = 0 }) => {
      console.log("⏩ [skipToSubtitleContent] Tool called with:", {
        userDescription,
        subtitleIndex,
        currentMedia,
      });

      if (subtitleConfigError) {
        return {
          success: false,
          error: subtitleConfigError,
        };
      }

      // Check if we have current media context
      if (!currentMedia || !currentMedia.id || !currentMedia.mediaSourceId) {
        return {
          success: false,
          error:
            "No media is currently playing. Please start playing a video first to use subtitle search.",
        };
      }

      try {
        const result = await getSubtitleContent(
          currentMedia.id,
          currentMedia.mediaSourceId,
          subtitleIndex
        );

        console.log("[skipToSubtitleContent] Subtitle fetch result:", result);

        if (!result.success) {
          return {
            success: false,
            error: result.error || "Failed to fetch subtitles",
          };
        }

        if (result.subtitles.length === 0) {
          return {
            success: false,
            error: `No subtitles found for ${currentMedia.name}`,
          };
        }

        // Format subtitle data for analysis - create a more structured prompt
        const subtitleText = result.subtitles
          .map(
            (sub, index) =>
              `${index + 1}. [${sub.timestampFormatted}] ${sub.text}`
          )
          .join("\n");

        // Create a prompt for the subtitle model to analyze
        const analysisPrompt = `You are analyzing subtitles from "${currentMedia.name}" to help a user skip to a specific scene.

User wants to skip to: "${userDescription}"

Subtitle entries (format: [HH:MM:SS] text):
${subtitleText}

Task: Find the most relevant timestamp that matches the user's description.

Consider:
- Semantic meaning and emotional context
- Scene transitions and narrative flow  
- Character dialogue and actions
- Plot developments that match the description

Return ONLY the timestamp in HH:MM:SS format (e.g., 02:25.6 or 1:23:45.2):`;

        const analysisResult = streamText({
          model: subtitleModel,
          messages: [{ role: "user", content: analysisPrompt }],
          maxOutputTokens: 512,
          providerOptions: SUBTITLE_PROVIDER_OPTIONS,
        });

        let analysisText = "";
        for await (const chunk of analysisResult.textStream) {
          console.log("[skipToSubtitleContent] Analysis chunk:", chunk);
          analysisText += chunk;
        }

        const trimmedAnalysis = analysisText.trim();
        console.log(
          "[skipToSubtitleContent] Analysis result:",
          trimmedAnalysis
        );

        if (!trimmedAnalysis) {
          return {
            success: false,
            error:
              "The subtitle model returned no content. Try a different subtitle model or a more specific description.",
          };
        }

        // Extract timestamp from the response (looking for HH:MM:SS format)
        // Order is important: match HH:MM:SS first, then MM:SS
        const timestampMatch = trimmedAnalysis.match(
          /\d{1,2}:\d{2}:\d{2}(?:\.\d+)?|\d{1,2}:\d{2}(?:\.\d+)?/
        );
        if (!timestampMatch) {
          return {
            success: false,
            error:
              "Could not determine the best timestamp for your request. Please try being more specific.",
          };
        }

        // Convert timestamp to seconds using our utility function
        console.log(
          "[skipToSubtitleContent] Extracted timestamp:",
          timestampMatch[0]
        );
        const bestTimestamp = convertTimestampToSeconds(timestampMatch[0]);
        console.log(
          "[skipToSubtitleContent] Converted to seconds:",
          bestTimestamp
        );

        // Find the corresponding subtitle entry for context
        const correspondingSubtitle =
          result.subtitles.find(
            (sub) => Math.abs(sub.timestamp - bestTimestamp) < 2 // Within 2 seconds
          ) ||
          result.subtitles.reduce((closest, current) =>
            Math.abs(current.timestamp - bestTimestamp) <
            Math.abs(closest.timestamp - bestTimestamp)
              ? current
              : closest
          );

        return {
          success: true,
          action: "skipTo",
          timestamp: bestTimestamp,
          timestampFormatted: correspondingSubtitle.timestampFormatted,
          text: correspondingSubtitle.text,
          message: `Found the scene you described in ${currentMedia.name} at ${correspondingSubtitle.timestampFormatted}. Skipping there now...`,
        };
      } catch (error) {
        console.error("[skipToSubtitleContent] Error:", error);
        return {
          success: false,
          error: "Failed to analyze subtitle content",
        };
      }
    },
  });

export const createExplainScene = (
  currentMedia: any,
  capturedTimestamp: number | undefined,
  subtitleModel: LanguageModel,
  subtitleConfigError?: string
) =>
  tool({
    description:
      "Analyze subtitles around the current timestamp to explain what's happening in the movie or show. Works when media is currently playing.",
    inputSchema: z.object({
      currentTimestamp: z
        .number()
        .optional()
        .describe(
          "The current playback timestamp in seconds. If omitted, the server uses the last known playback position."
        ),
      contextWindow: z
        .number()
        .optional()
        .describe(
          "Number of seconds before and after current timestamp to analyze (default: 30)"
        ),
      subtitleIndex: z
        .number()
        .optional()
        .describe("The subtitle stream index (default: 0)"),
    }),
    execute: async ({
      currentTimestamp,
      contextWindow = 30,
      subtitleIndex = 0,
    }) => {
      if (subtitleConfigError) {
        return {
          success: false,
          error: subtitleConfigError,
        };
      }

      const timestamp =
        typeof currentTimestamp === "number" && currentTimestamp > 0
          ? currentTimestamp
          : capturedTimestamp ?? currentTimestamp ?? 0;

      console.log("📖 [explainScene] Tool called with:", {
        currentTimestamp: timestamp,
        contextWindow,
        subtitleIndex,
        currentMedia,
      });

      // Check if we have current media context
      if (!currentMedia || !currentMedia.id || !currentMedia.mediaSourceId) {
        return {
          success: false,
          error:
            "No media is currently playing. Please start playing a video first to get scene explanations.",
        };
      }

      try {
        const result = await getSubtitleContent(
          currentMedia.id,
          currentMedia.mediaSourceId,
          subtitleIndex
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || "Failed to fetch subtitles",
          };
        }

        if (result.subtitles.length === 0) {
          return {
            success: false,
            error: `No subtitles found for ${currentMedia.name}`,
          };
        }

        // Filter subtitles to get context around current timestamp
        const startTime = Math.max(0, timestamp - contextWindow);
        const endTime = timestamp + contextWindow;

        const relevantSubtitles = result.subtitles.filter(
          (sub) => sub.timestamp >= startTime && sub.timestamp <= endTime
        );

        if (relevantSubtitles.length === 0) {
          return {
            success: false,
            error:
              "No subtitles found around the current timestamp. The scene might be silent or you may need to adjust the time window.",
          };
        }

        // Format subtitle context for analysis
        const subtitleContext = relevantSubtitles
          .map(
            (sub) =>
              `[${sub.timestampFormatted}] ${sub.text}${
                Math.abs(sub.timestamp - timestamp) <= 2
                  ? " ← CURRENT POSITION"
                  : ""
              }`
          )
          .join("\n");

        const analysisPrompt = `You are analyzing a scene from "${currentMedia.name}" to explain what's happening to the viewer.\n\nSubtitle context:\n${subtitleContext}\n\nProvide a natural 1-2 sentence explanation of what's happening in this scene. Focus on the key action and who's involved. Don't mention timestamps - just explain the scene naturally.`;

        const analysisResult = streamText({
          model: subtitleModel,
          messages: [{ role: "user", content: analysisPrompt }],
          maxOutputTokens: 1024,
          providerOptions: SUBTITLE_PROVIDER_OPTIONS,
        });

        let explanation = "";
        for await (const chunk of analysisResult.textStream) {
          explanation += chunk;
        }

        const trimmedExplanation = explanation.trim();
        console.log("[explainScene] Generated explanation:", trimmedExplanation);

        if (!trimmedExplanation) {
          return {
            success: false,
            error:
              "The subtitle model returned no content. Try a different subtitle model.",
          };
        }

        // Find the closest subtitle to current timestamp for reference
        const closestSubtitle = relevantSubtitles.reduce((closest, current) =>
          Math.abs(current.timestamp - timestamp) <
          Math.abs(closest.timestamp - timestamp)
            ? current
            : closest
        );

        return {
          success: true,
          explanation: trimmedExplanation,
          currentTime: {
            timestamp,
            formatted: `${Math.floor(timestamp / 60)}:${String(
              Math.floor(timestamp % 60)
            ).padStart(2, "0")}`,
          },
          contextSubtitles: relevantSubtitles.length,
          closestDialogue: {
            text: closestSubtitle.text,
            timestamp: closestSubtitle.timestampFormatted,
          },
          mediaName: currentMedia.name,
        };
      } catch (error) {
        console.error("[explainScene] Error:", error);
        return {
          success: false,
          error: "Failed to analyze scene content",
        };
      }
    },
  });

export const createAnalyzeMedia = (
  currentMedia: any,
  subtitleModel: LanguageModel,
  subtitleConfigError?: string
) =>
  tool({
    description:
      "Analyze the entire movie or episode using subtitles to answer questions about the plot, characters, themes, or any aspect of the content. Works when media is currently playing.",
    inputSchema: z.object({
      userQuestion: z
        .string()
        .describe(
          "The user's question about the movie/episode (e.g., 'What is this about?', 'Who are the main characters?', 'What happened at the end?')"
        ),
      subtitleIndex: z
        .number()
        .optional()
        .describe("The subtitle stream index (default: 0)"),
    }),
    execute: async ({ userQuestion, subtitleIndex = 0 }) => {
      console.log("🎬 [analyzeMedia] Tool called with:", {
        userQuestion,
        subtitleIndex,
        currentMedia,
      });

      if (subtitleConfigError) {
        return {
          success: false,
          error: subtitleConfigError,
        };
      }

      // Check if we have current media context
      if (!currentMedia || !currentMedia.id || !currentMedia.mediaSourceId) {
        return {
          success: false,
          error:
            "No media is currently playing. Please start playing a video first to analyze the content.",
        };
      }

      try {
        const result = await getSubtitleContent(
          currentMedia.id,
          currentMedia.mediaSourceId,
          subtitleIndex
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || "Failed to fetch subtitles",
          };
        }

        if (result.subtitles.length === 0) {
          return {
            success: false,
            error: `No subtitles found for ${currentMedia.name}`,
          };
        }

        // Format all subtitles for analysis
        const allSubtitles = result.subtitles
          .map((sub) => `[${sub.timestampFormatted}] ${sub.text}`)
          .join("\n");

        const analysisPrompt = `You are analyzing "${currentMedia.name}" to answer a user's question about the content.\n\nUser's question: "${userQuestion}"\n\nComplete subtitle content:\n${allSubtitles}\n\nProvide a helpful and accurate answer to the user's question in a natural and conversational style. Focus on the plot, characters, themes, or relevant details. Keep your response informative but concise.`;

        const analysisResult = streamText({
          model: subtitleModel,
          messages: [{ role: "user", content: analysisPrompt }],
          maxOutputTokens: 2048,
          providerOptions: SUBTITLE_PROVIDER_OPTIONS,
        });

        let answer = "";
        for await (const chunk of analysisResult.textStream) {
          answer += chunk;
        }

        const trimmedAnswer = answer.trim();
        console.log("[analyzeMedia] Generated answer:", trimmedAnswer);

        if (!trimmedAnswer) {
          return {
            success: false,
            error:
              "The subtitle model returned no content. Try a different subtitle model.",
          };
        }

        return {
          success: true,
          answer: trimmedAnswer,
          question: userQuestion,
          mediaName: currentMedia.name,
          subtitleCount: result.subtitles.length,
        };
      } catch (error) {
        console.error("[analyzeMedia] Error:", error);
        return {
          success: false,
          error: "Failed to analyze media content",
        };
      }
    },
  });
