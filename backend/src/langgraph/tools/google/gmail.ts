import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getGoogleConnectedAccountCredentials } from "../../../services/integrations.js";
import type { WorkflowState } from "../../state.js";

const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

type GmailToolContext = Pick<WorkflowState, "user">;

type GmailApiError = {
  error?: {
    message?: string;
  };
};

type GmailMessageListResponse = {
  messages?: Array<{
    id?: string;
    threadId?: string;
  }>;
};

type GmailMessageResponse = {
  id?: string;
  threadId?: string;
  snippet?: string;
  payload?: {
    mimeType?: string;
    body?: {
      data?: string;
    };
    headers?: Array<{
      name?: string;
      value?: string;
    }>;
    parts?: GmailMessagePart[];
  };
};

type GmailMessagePart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
};

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function buildRawEmail(input: {
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
}): string {
  const headers = [
    `From: ${sanitizeHeaderValue(input.from)}`,
    `To: ${sanitizeHeaderValue(input.to)}`,
    input.cc?.trim() ? `Cc: ${sanitizeHeaderValue(input.cc)}` : null,
    input.bcc?.trim() ? `Bcc: ${sanitizeHeaderValue(input.bcc)}` : null,
    `Subject: ${sanitizeHeaderValue(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ].filter((header): header is string => Boolean(header));

  return `${headers.join("\r\n")}\r\n\r\n${input.body}`;
}

async function gmailRequest<T>(input: {
  accessToken: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<T> {
  const response = await fetch(`${GMAIL_API_BASE_URL}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      ...(input.body ? { "Content-Type": "application/json" } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as T & GmailApiError;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gmail API failed with HTTP ${response.status}.`);
  }

  return payload;
}

async function getCredentials(context: GmailToolContext, requiredScopes: string[]) {
  return await getGoogleConnectedAccountCredentials({
    userId: context.user.id,
    companyId: context.user.companyId,
    requiredScopes,
  });
}

function getHeader(message: GmailMessageResponse, headerName: string): string {
  const header = message.payload?.headers?.find(
    (item) => item.name?.toLowerCase() === headerName.toLowerCase(),
  );
  return header?.value ?? "";
}

function summarizeMessage(message: GmailMessageResponse) {
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from: getHeader(message, "From"),
    to: getHeader(message, "To"),
    subject: getHeader(message, "Subject"),
    date: getHeader(message, "Date"),
    snippet: message.snippet ?? "",
  };
}

function extractBodyFromPart(part: GmailMessagePart | undefined): string {
  if (!part) {
    return "";
  }

  if ((part.mimeType === "text/plain" || part.mimeType === "text/html") && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  for (const childPart of part.parts ?? []) {
    const body = extractBodyFromPart(childPart);
    if (body) {
      return body;
    }
  }

  return "";
}

export function createGmailCreateDraftTool(context: GmailToolContext) {
  return tool(
    async ({ to, cc, bcc, subject, body }) => {
      try {
        const credentials = await getCredentials(context, [GMAIL_COMPOSE_SCOPE]);
        const raw = encodeBase64Url(
          buildRawEmail({
            from: credentials.providerEmail,
            to,
            cc,
            bcc,
            subject,
            body,
          }),
        );

        const draft = await gmailRequest<{ id?: string; message?: { id?: string } }>({
          accessToken: credentials.accessToken,
          path: "/drafts",
          method: "POST",
          body: {
            message: { raw },
          },
        });

        return JSON.stringify({
          status: "draft_created",
          draftId: draft.id ?? "",
          messageId: draft.message?.id ?? "",
          to,
          subject,
          nextAction:
            "Tell the user this draft was created and include the exact draftId. If the user later asks to send it, call gmail_send_draft with this draftId.",
        });
      } catch (error) {
        return error instanceof Error ? error.message : "Failed to create Gmail draft.";
      }
    },
    {
      name: "gmail_create_draft",
      description:
        "Create a Gmail draft for the current user. Use this before sending email so the draft can be reviewed or sent by draft ID.",
      schema: z.object({
        to: z.string().email().describe("Primary recipient email address."),
        cc: z.string().optional().describe("Optional comma-separated CC recipients."),
        bcc: z.string().optional().describe("Optional comma-separated BCC recipients."),
        subject: z.string().min(1).describe("Email subject."),
        body: z.string().min(1).describe("Plain text email body."),
      }),
    },
  );
}

export function createGmailSendDraftTool(context: GmailToolContext) {
  return tool(
    async ({ draftId }) => {
      try {
        const credentials = await getCredentials(context, [GMAIL_COMPOSE_SCOPE]);
        const result = await gmailRequest<{ id?: string; threadId?: string }>({
          accessToken: credentials.accessToken,
          path: "/drafts/send",
          method: "POST",
          body: {
            id: draftId,
          },
        });

        return JSON.stringify({
          status: "draft_sent",
          draftId,
          messageId: result.id ?? "",
          threadId: result.threadId ?? "",
        });
      } catch (error) {
        return error instanceof Error ? error.message : "Failed to send Gmail draft.";
      }
    },
    {
      name: "gmail_send_draft",
      description:
        "Send an existing Gmail draft by draft ID. Use the most recent draftId from the conversation when the user asks to send it. Do not use this to send raw email content directly.",
      schema: z.object({
        draftId: z.string().min(1).describe("The Gmail draft ID returned by gmail_create_draft."),
      }),
    },
  );
}

export function createGmailSearchMessagesTool(context: GmailToolContext) {
  return tool(
    async ({ query, maxResults }) => {
      try {
        const credentials = await getCredentials(context, [GMAIL_READONLY_SCOPE]);
        const searchParams = new URLSearchParams({
          q: query,
          maxResults: String(maxResults),
        });
        const list = await gmailRequest<GmailMessageListResponse>({
          accessToken: credentials.accessToken,
          path: `/messages?${searchParams.toString()}`,
        });

        const messages = await Promise.all(
          (list.messages ?? []).slice(0, maxResults).map(async (message) => {
            if (!message.id) {
              return null;
            }

            const details = await gmailRequest<GmailMessageResponse>({
              accessToken: credentials.accessToken,
              path: `/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            });

            return summarizeMessage(details);
          }),
        );

        return JSON.stringify({
          query,
          messages: messages.filter(Boolean),
        });
      } catch (error) {
        return error instanceof Error ? error.message : "Failed to search Gmail messages.";
      }
    },
    {
      name: "gmail_search_messages",
      description:
        "Search the current user's Gmail messages by Gmail query syntax and return message IDs with metadata snippets.",
      schema: z.object({
        query: z.string().min(1).describe("Gmail search query, such as from:name@example.com or subject:invoice."),
        maxResults: z.number().int().min(1).max(10).default(5).describe("Maximum messages to return."),
      }),
    },
  );
}

export function createGmailReadMessageTool(context: GmailToolContext) {
  return tool(
    async ({ messageId }) => {
      try {
        const credentials = await getCredentials(context, [GMAIL_READONLY_SCOPE]);
        const message = await gmailRequest<GmailMessageResponse>({
          accessToken: credentials.accessToken,
          path: `/messages/${encodeURIComponent(messageId)}?format=full`,
        });

        return JSON.stringify({
          ...summarizeMessage(message),
          body: extractBodyFromPart(message.payload),
        });
      } catch (error) {
        return error instanceof Error ? error.message : "Failed to read Gmail message.";
      }
    },
    {
      name: "gmail_read_message",
      description:
        "Read metadata and snippet for one Gmail message by ID. Use IDs returned by gmail_search_messages.",
      schema: z.object({
        messageId: z.string().min(1).describe("Gmail message ID."),
      }),
    },
  );
}
