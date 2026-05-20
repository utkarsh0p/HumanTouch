import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { settings } from "../../config.js";

export const webSearchTool = tool(
  async ({ query, maxResults }) => {
    if (!settings.tavilyApiKey) {
      return "Search is not configured.";
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: settings.tavilyApiKey,
        query,
        search_depth: "advanced",
        include_answer: true,
        include_raw_content: false,
        max_results: maxResults,
      }),
    });

    if (!response.ok) {
      return `Search failed with HTTP ${response.status}.`;
    }

    const data = (await response.json()) as {
      answer?: string;
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
      }>;
    };

    return JSON.stringify({
      answer: data.answer ?? null,
      results: (data.results ?? []).slice(0, maxResults).map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        content: result.content ?? "",
      })),
    });
  },
  {
    name: "web_search",
    description:
      "Search the public web for current facts, research, companies, products, people, documentation, and recent events. Use this when the answer depends on up-to-date external information.",
    schema: z.object({
      query: z.string().min(3).describe("The search query."),
      maxResults: z.number().int().min(1).max(8).default(5).describe("Maximum search results."),
    }),
  },
);
