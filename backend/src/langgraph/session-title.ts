import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogle } from "@langchain/google/node";

import { settings } from "../config.js";

const llm = new ChatGoogle({
  apiKey: settings.googleApiKey,
  model: settings.geminiModel,
  temperature: 0.1,
  maxRetries: 2,
});

const titleInstructions = [
  "You write concise chat session titles.",
  "Given the user's first message, return a short session title.",
  "Use 3 to 7 words when possible.",
  "Do not use quotes.",
  "Do not use markdown.",
  "Do not add labels or commentary.",
  "Keep the wording specific to the user's request.",
].join(" ");

function normalizeTitle(rawTitle: string, fallback: string): string {
  const title = rawTitle.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
  if (!title) {
    return fallback;
  }

  return title.slice(0, 80);
}

export async function generateSessionTitle(firstMessage: string): Promise<string> {
  const fallback = firstMessage.trim().slice(0, 80) || "New session";

  try {
    const response = await llm.invoke([
      new SystemMessage(titleInstructions),
      new HumanMessage(firstMessage),
    ]);

    const content =
      typeof response.content === "string"
        ? response.content
        : response.content
            .map((part) =>
              typeof part === "string"
                ? part
                : "text" in part && typeof part.text === "string"
                  ? part.text
                  : "",
            )
            .join("");

    return normalizeTitle(content, fallback);
  } catch {
    return fallback;
  }
}
