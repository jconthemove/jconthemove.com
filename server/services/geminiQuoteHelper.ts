import { GoogleGenAI } from "@google/genai";

export const QUOTE_HELPER_MESSAGE_LIMIT = 4_000;

const DEFAULT_MODEL = "gemini-3-flash-preview";

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedApiKey = apiKey;
  }

  return cachedClient;
}

function buildQuoteHelperPrompt(message: string): string {
  return `
You are JC ON THE MOVE LLC's backend job intake assistant.
Summarize this customer request for an internal dispatcher.

Return concise JSON only with these fields:
{
  "serviceType": "moving" | "junk" | "handyman" | "delivery" | "unknown",
  "jobSize": "short plain-English estimate",
  "crewNeeds": "recommended crew size and why",
  "truckTrailerNeeds": "truck/trailer/equipment recommendation",
  "nextStep": "next action for staff or customer",
  "customerReplyDraft": "friendly SMS/email reply under 90 words",
  "internalSummary": "one-paragraph dispatcher summary",
  "confidence": 0.0
}

Customer message:
${message}
  `.trim();
}

export async function summarizeQuoteRequest(message: string): Promise<{ result: string; model: string }> {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    throw new Error("message is required");
  }

  if (normalizedMessage.length > QUOTE_HELPER_MESSAGE_LIMIT) {
    throw new Error(`message must be ${QUOTE_HELPER_MESSAGE_LIMIT} characters or less`);
  }

  const model = process.env.GEMINI_QUOTE_HELPER_MODEL || DEFAULT_MODEL;
  const response = await getGeminiClient().models.generateContent({
    model,
    contents: buildQuoteHelperPrompt(normalizedMessage),
  });

  return {
    result: response.text ?? "",
    model,
  };
}
