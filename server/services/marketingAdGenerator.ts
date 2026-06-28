import { z } from "zod";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-mini";

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.string().url().max(2000).optional(),
);

export const marketingAdDraftSchema = z.object({
  area: z.string().trim().max(120).optional().default("Northwoods"),
  focus: z.string().trim().max(120).optional().default("moving help"),
  rawText: z.string().trim().max(900).optional().default(""),
  photoUrl: optionalUrlSchema,
  referralLink: z.string().url().max(2000),
  promoCode: z.string().trim().max(64).optional().default(""),
  workerName: z.string().trim().max(120).optional().default("JC crew"),
});

export type MarketingAdDraftInput = z.infer<typeof marketingAdDraftSchema>;

export type MarketingAdDraftResult = {
  headline: string;
  facebookPost: string;
  shortText: string;
  hashtags: string[];
  ctaLabel: string;
  photoSuggestion: string;
  provider: "openai" | "deterministic";
  model: string;
  fallbackUsed: boolean;
  reason?: string;
};

const adDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "facebookPost", "shortText", "hashtags", "ctaLabel", "photoSuggestion"],
  properties: {
    headline: { type: "string" },
    facebookPost: { type: "string" },
    shortText: { type: "string" },
    hashtags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
    ctaLabel: { type: "string" },
    photoSuggestion: { type: "string" },
  },
} as const;

function cleanWords(value: string | undefined, fallback: string) {
  const text = String(value || "").trim();
  return text.length > 0 ? text : fallback;
}

function fallbackDraft(input: MarketingAdDraftInput, reason?: string): MarketingAdDraftResult {
  const area = cleanWords(input.area, "the Northwoods");
  const focus = cleanWords(input.focus, "moving help");
  const promoLine = input.promoCode ? `\nUse code ${input.promoCode}.` : "";
  const extra = input.rawText ? `\n\n${input.rawText}` : "";
  const photoLine = input.photoUrl ? "\n\nPhoto: use the attached job/crew image." : "";
  const facebookPost = [
    `Need ${focus} around ${area}?`,
    "JC ON THE MOVE can help with moving, delivery, junk removal, cleanup, and local labor.",
    "Send the details, add photos if you have them, and we will build the right quote before the crew is confirmed.",
    `${input.referralLink}${promoLine}${extra}${photoLine}`,
  ].join("\n\n");

  return {
    headline: `${focus} available in ${area}`,
    facebookPost,
    shortText: `Need ${focus}? Book JC ON THE MOVE: ${input.referralLink}${input.promoCode ? ` Code ${input.promoCode}.` : ""}`,
    hashtags: ["#JCONTHEMOVE", "#Northwoods", "#MovingHelp"],
    ctaLabel: "Book / Quote",
    photoSuggestion: input.photoUrl ? "Use the supplied photo and keep the booking link in the post." : "Use a clean crew, truck, before/after, or completed-job photo.",
    provider: "deterministic",
    model: "fallback-marketing-template",
    fallbackUsed: true,
    reason,
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

export async function generateMarketingAdDraft(rawInput: MarketingAdDraftInput): Promise<MarketingAdDraftResult> {
  const input = marketingAdDraftSchema.parse(rawInput);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MARKETING_MODEL || process.env.OPENAI_BOOKING_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return fallbackDraft(input, "OPENAI_API_KEY is not configured");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content: [
            "You write practical local-service ads for JC ON THE MOVE.",
            "Keep posts simple, trustworthy, and community-focused.",
            "Never promise guaranteed availability, exact prices, financing, or same-day service.",
            "Always include the provided booking/referral link in the Facebook post and short text.",
            "Do not invent testimonials, licenses, reviews, discounts, or photos.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "jc_marketing_ad_draft",
          strict: true,
          schema: adDraftJsonSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return fallbackDraft(input, `OpenAI ${response.status}: ${detail.slice(0, 180)}`);
  }

  try {
    const data = await response.json();
    const parsed = JSON.parse(extractOutputText(data));
    return {
      headline: String(parsed.headline || "").slice(0, 160) || fallbackDraft(input).headline,
      facebookPost: String(parsed.facebookPost || "").slice(0, 2200) || fallbackDraft(input).facebookPost,
      shortText: String(parsed.shortText || "").slice(0, 320) || fallbackDraft(input).shortText,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String).slice(0, 6) : fallbackDraft(input).hashtags,
      ctaLabel: String(parsed.ctaLabel || "Book / Quote").slice(0, 80),
      photoSuggestion: String(parsed.photoSuggestion || fallbackDraft(input).photoSuggestion).slice(0, 240),
      provider: "openai",
      model,
      fallbackUsed: false,
    };
  } catch (error) {
    return fallbackDraft(input, error instanceof Error ? error.message : "OpenAI marketing response parse failed");
  }
}
