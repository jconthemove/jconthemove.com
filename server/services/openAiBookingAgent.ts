import type { BookingIntakeResult } from "@shared/bookingIntake";
import { buildBookingIntakeFromChatbot } from "@shared/bookingIntake";

type ChatbotAnswers = Record<string, unknown>;

export const OPENAI_BOOKING_AGENT_DEFAULT_MODEL = "gpt-5.4-mini";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

type OpenAiBookingExtraction = {
  serviceCode: string;
  serviceAddress: string;
  fromAddress: string;
  toAddress: string;
  moveDate: string;
  jobSize: string;
  loadType: string;
  bedrooms: string;
  stairs: number;
  truckSize: string;
  selectedPackage: string;
  confidence: "high" | "medium" | "low";
  missing: string[];
  notes: string[];
};

export type BookingAgentProvider = "openai" | "deterministic";

export type BookingAgentIntakeResult = BookingIntakeResult & {
  agent: {
    provider: BookingAgentProvider;
    model: string;
    fallbackUsed: boolean;
    reason?: string;
  };
};

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "serviceCode",
    "serviceAddress",
    "fromAddress",
    "toAddress",
    "moveDate",
    "jobSize",
    "loadType",
    "bedrooms",
    "stairs",
    "truckSize",
    "selectedPackage",
    "confidence",
    "missing",
    "notes",
  ],
  properties: {
    serviceCode: {
      type: "string",
      enum: [
        "moving",
        "junk_removal",
        "trash_valet",
        "window_cleaning",
        "painting",
        "flooring",
        "roofing",
        "handyman",
        "snow_removal",
        "lawn_care",
        "move_cleaning",
        "demolition",
        "assembly",
        "jump_start",
      ],
    },
    serviceAddress: { type: "string" },
    fromAddress: { type: "string" },
    toAddress: { type: "string" },
    moveDate: { type: "string" },
    jobSize: { type: "string", enum: ["", "small", "medium", "large"] },
    loadType: { type: "string", enum: ["", "local", "load_only", "unload_only"] },
    bedrooms: { type: "string" },
    stairs: { type: "integer" },
    truckSize: { type: "string" },
    selectedPackage: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    missing: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

function fallbackIntake(
  answers: ChatbotAnswers,
  serviceLabel: string | undefined,
  reason?: string,
): BookingAgentIntakeResult {
  return {
    ...buildBookingIntakeFromChatbot(answers, serviceLabel),
    agent: {
      provider: "deterministic",
      model: "shared/bookingIntake",
      fallbackUsed: true,
      reason,
    },
  };
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;
  const chunks: string[] = [];
  for (const item of response?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("");
}

function mergeExtractionIntoIntake(
  fallback: BookingIntakeResult,
  extraction: OpenAiBookingExtraction,
  model: string,
): BookingAgentIntakeResult {
  const fallbackItem = fallback.bookingQuoteRequest.items[0];
  const details = {
    ...(fallbackItem.details ?? {}),
    aiProvider: "openai",
    serviceAddress: extraction.serviceAddress || (fallbackItem.details as any)?.serviceAddress,
    fromAddress: extraction.fromAddress || (fallbackItem.details as any)?.fromAddress,
    toAddress: extraction.toAddress || (fallbackItem.details as any)?.toAddress,
    moveDate: extraction.moveDate || (fallbackItem.details as any)?.moveDate,
    selectedPackage: extraction.selectedPackage || (fallbackItem.details as any)?.selectedPackage,
    jobSize: extraction.jobSize || (fallbackItem.details as any)?.jobSize,
    loadType: extraction.loadType || (fallbackItem.details as any)?.loadType,
    bedrooms: extraction.bedrooms || (fallbackItem.details as any)?.bedrooms,
    stairs: Number.isFinite(extraction.stairs) ? extraction.stairs : (fallbackItem.details as any)?.stairs,
    truckSize: extraction.truckSize || (fallbackItem.details as any)?.truckSize,
  };

  return {
    bookingQuoteRequest: {
      ...fallback.bookingQuoteRequest,
      source: "openai_booking_orchestrator",
      items: [
        {
          ...fallbackItem,
          serviceCode: extraction.serviceCode || fallbackItem.serviceCode,
          details,
        },
      ],
    },
    confidence: extraction.confidence || fallback.confidence,
    missing: Array.from(new Set([...(fallback.missing ?? []), ...(extraction.missing ?? [])])),
    notes: Array.from(new Set([...(fallback.notes ?? []), ...(extraction.notes ?? [])])),
    agent: {
      provider: "openai",
      model,
      fallbackUsed: false,
    },
  };
}

export function isOpenAiBookingAgentConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function buildBookingIntakeWithOpenAi(
  answers: ChatbotAnswers,
  serviceLabel?: string,
): Promise<BookingAgentIntakeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_BOOKING_MODEL || OPENAI_BOOKING_AGENT_DEFAULT_MODEL;
  const deterministic = buildBookingIntakeFromChatbot(answers, serviceLabel);

  if (!apiKey) {
    return {
      ...deterministic,
      agent: {
        provider: "deterministic",
        model: "shared/bookingIntake",
        fallbackUsed: true,
        reason: "OPENAI_API_KEY is not configured",
      },
    };
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: [
            "You are JC ON THE MOVE LLC's booking intake orchestrator.",
            "Extract only facts present in the provided chatbot answers.",
            "Do not calculate price, charge customers, create jobs, assign crews, or invent addresses.",
            "Use empty strings for unknown scalar fields and list unknown required booking facts in missing.",
            "The backend pricing engine will calculate all money server-side after this extraction.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({ serviceLabel, answers }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "jc_booking_intake",
          strict: true,
          schema: extractionSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return fallbackIntake(answers, serviceLabel, `OpenAI ${response.status}: ${text.slice(0, 180)}`);
  }

  try {
    const data = await response.json();
    const outputText = extractOutputText(data);
    const extraction = JSON.parse(outputText) as OpenAiBookingExtraction;
    return mergeExtractionIntoIntake(deterministic, extraction, model);
  } catch (error) {
    return fallbackIntake(
      answers,
      serviceLabel,
      error instanceof Error ? error.message : "OpenAI response parse failed",
    );
  }
}
