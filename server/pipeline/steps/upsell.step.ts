import type { PipelineContext, UpsellChip } from "../context";

// Rule-based upsell chips. Returns up to 3 suggestions the frontend can
// render next to the quote. Rules mirror the booking funnel's proven
// cross-sells (Moving → Cleaning + Junk, Junk → Moving, Lawn → Snow,
// Cleaning → Window).
const RULES: { when: string; chips: UpsellChip[] }[] = [
  {
    when: "moving",
    chips: [
      { code: "move_cleaning", label: "Add move-out cleaning", reason: "Leave the old place spotless — most moving customers add this." },
      { code: "junk_removal", label: "Add junk haul-away", reason: "Clear out what you don't want to bring with you." },
      { code: "handyman", label: "Hang TVs & mount shelves", reason: "1-hour handyman to settle in faster." },
    ],
  },
  {
    when: "junk_removal",
    chips: [
      { code: "moving", label: "Need help moving?", reason: "Book the crew that's already on site." },
      { code: "cleaning", label: "Add a deep clean", reason: "Ideal after clearing out." },
    ],
  },
  {
    when: "lawn_care",
    chips: [
      { code: "snow_removal", label: "Lock in winter snow plow", reason: "Same crew, year-round coverage." },
      { code: "window_cleaning", label: "Add window cleaning", reason: "Curb appeal in one visit." },
    ],
  },
  {
    when: "cleaning",
    chips: [
      { code: "window_cleaning", label: "Add window cleaning", reason: "Finish the job inside & out." },
      { code: "trash_valet", label: "Weekly trash valet", reason: "Never carry the can to the curb again." },
    ],
  },
  {
    when: "move_cleaning",
    chips: [
      { code: "moving", label: "Need movers too?", reason: "Bundle moving + cleaning and save." },
    ],
  },
];

export async function upsellStep(ctx: PipelineContext): Promise<PipelineContext> {
  const present = new Set(ctx.input.items.map((i) => i.serviceCode));
  const out: UpsellChip[] = [];
  for (const rule of RULES) {
    if (!present.has(rule.when)) continue;
    for (const chip of rule.chips) {
      if (present.has(chip.code)) continue;
      if (out.some((c) => c.code === chip.code)) continue;
      out.push(chip);
      if (out.length >= 3) break;
    }
    if (out.length >= 3) break;
  }
  ctx.upsellChips = out;
  return ctx;
}
