import { writeFileSync, mkdirSync } from "node:fs";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 54;
const LINE_H = 13;

const FONTS = {
  R: { id: "F1", name: "Helvetica" },
  B: { id: "F2", name: "Helvetica-Bold" },
  O: { id: "F3", name: "Helvetica-Oblique" },
};

const HELV_W = (() => {
  const w = new Array(256).fill(500);
  const set = (s, v) => { for (const c of s) w[c.charCodeAt(0)] = v; };
  set(" ", 278); set("!", 278); set('"', 355); set("#", 556); set("$", 556);
  set("%", 889); set("&", 667); set("'", 191); set("(", 333); set(")", 333);
  set("*", 389); set("+", 584); set(",", 278); set("-", 333); set(".", 278);
  set("/", 278); set(":", 278); set(";", 278); set("<", 584); set("=", 584);
  set(">", 584); set("?", 556); set("@", 1015);
  set("ABCDEFGHJKLMNOPQRSTUVWXYZ", 667);
  set("I", 278); set("F", 611); set("L", 556); set("P", 667); set("T", 611);
  set("V", 667); set("Y", 667);
  set("abcdeghknopqu", 556); set("f", 278); set("ijl", 222); set("m", 833);
  set("rs", 333); set("t", 278); set("vwxyz", 500);
  set("[", 278); set("]", 278); set("\\", 278); set("^", 469); set("_", 556);
  set("`", 333); set("{", 334); set("}", 334); set("|", 260); set("~", 584);
  return w;
})();

const HELV_B_W = (() => {
  const w = new Array(256).fill(556);
  const set = (s, v) => { for (const c of s) w[c.charCodeAt(0)] = v; };
  set(" ", 278); set(".", 333); set(",", 333); set(":", 333); set(";", 333);
  set("/", 278); set("-", 333); set("(", 333); set(")", 333);
  set("ABCDEGHKNOQRUVXY", 722); set("F", 611); set("I", 278); set("J", 500);
  set("L", 611); set("M", 833); set("P", 667); set("S", 667); set("T", 611);
  set("W", 944); set("Z", 611);
  set("abcdeghnopqu", 556); set("f", 333); set("ijl", 278); set("k", 556);
  set("m", 833); set("rs", 389); set("t", 333); set("vwxyz", 500);
  return w;
})();

function widthOf(text, font, size) {
  const table = font === "B" ? HELV_B_W : HELV_W;
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    w += (table[code] ?? 500) * size / 1000;
  }
  return w;
}

function escapePdf(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// ASCII-only: replace common UTF chars with ASCII fallbacks so the
// built-in Helvetica encoding (WinAnsi) renders cleanly.
function asciify(s) {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u2713|\u2705/g, "[x]")
    .replace(/\u274C/g, "[X]")
    .replace(/\u26A0\uFE0F?/g, "(!)")
    .replace(/\u00D7/g, "x")
    .replace(/[^\x00-\x7E]/g, "");
}

function wrap(text, font, size, maxWidth) {
  const out = [];
  for (const para of text.split("\n")) {
    if (para === "") { out.push(""); continue; }
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (widthOf(test, font, size) <= maxWidth) {
        line = test;
      } else {
        if (line) out.push(line);
        // hard-break overlong tokens
        let chunk = "";
        for (const ch of word) {
          if (widthOf(chunk + ch, font, size) > maxWidth && chunk) {
            out.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

class PdfBuilder {
  constructor() {
    this.pages = [];   // each: array of content strings
    this.current = null;
    this.cursorY = 0;
    this.newPage();
  }
  newPage() {
    this.current = [];
    this.pages.push(this.current);
    this.cursorY = PAGE_H - MARGIN_TOP;
  }
  ensure(spaceNeeded) {
    if (this.cursorY - spaceNeeded < MARGIN_BOTTOM) this.newPage();
  }
  drawText(text, { font = "R", size = 10, indent = 0, color = "0 0 0" } = {}) {
    const fid = FONTS[font].id;
    const x = MARGIN_X + indent;
    this.current.push(
      `BT ${color} rg /${fid} ${size} Tf ${x.toFixed(2)} ${this.cursorY.toFixed(2)} Td (${escapePdf(asciify(text))}) Tj ET`
    );
  }
  paragraph(text, opts = {}) {
    const { font = "R", size = 10, indent = 0, after = 4, color = "0 0 0" } = opts;
    const maxW = PAGE_W - MARGIN_X * 2 - indent;
    const lines = wrap(asciify(text), font, size, maxW);
    for (const line of lines) {
      this.ensure(LINE_H);
      this.drawText(line, { font, size, indent, color });
      this.cursorY -= size + 3;
    }
    this.cursorY -= after;
  }
  heading(text, level = 1) {
    const sizeMap = { 1: 18, 2: 14, 3: 11 };
    const size = sizeMap[level] || 10;
    this.ensure(size + 18);
    if (level === 1) this.cursorY -= 6;
    if (level === 2) this.cursorY -= 8;
    this.drawText(text, { font: "B", size });
    this.cursorY -= size + 6;
    if (level === 1) {
      // underline
      this.current.push(
        `q 0.6 0.6 0.6 RG 0.5 w ${MARGIN_X} ${this.cursorY + 4} m ${PAGE_W - MARGIN_X} ${this.cursorY + 4} l S Q`
      );
      this.cursorY -= 4;
    }
  }
  rule() {
    this.ensure(10);
    this.cursorY -= 4;
    this.current.push(
      `q 0.85 0.85 0.85 RG 0.4 w ${MARGIN_X} ${this.cursorY} m ${PAGE_W - MARGIN_X} ${this.cursorY} l S Q`
    );
    this.cursorY -= 8;
  }
  bullet(text, opts = {}) {
    const indent = opts.indent ?? 14;
    this.paragraph("- " + text, { ...opts, indent });
  }
  table(headers, rows, colWidths) {
    const totalW = PAGE_W - MARGIN_X * 2;
    const widths = colWidths.map(w => w * totalW);
    const padX = 4, padY = 5, size = 9;
    const rowHeight = (cells) => {
      let max = 1;
      cells.forEach((cell, i) => {
        const lines = wrap(asciify(String(cell)), "R", size, widths[i] - padX * 2);
        max = Math.max(max, lines.length);
      });
      return max * (size + 2) + padY * 2;
    };
    const drawRow = (cells, isHeader) => {
      const h = rowHeight(cells);
      this.ensure(h);
      const yTop = this.cursorY;
      const yBottom = yTop - h;
      // header background
      if (isHeader) {
        this.current.push(`q 0.93 0.93 0.95 rg ${MARGIN_X} ${yBottom} ${totalW} ${h} re f Q`);
      }
      // border
      this.current.push(`q 0.75 0.75 0.78 RG 0.4 w ${MARGIN_X} ${yBottom} ${totalW} ${h} re S Q`);
      // column dividers
      let cx = MARGIN_X;
      for (let i = 0; i < widths.length - 1; i++) {
        cx += widths[i];
        this.current.push(`q 0.85 0.85 0.88 RG 0.4 w ${cx} ${yBottom} m ${cx} ${yTop} l S Q`);
      }
      // text
      let xCursor = MARGIN_X;
      for (let i = 0; i < cells.length; i++) {
        const lines = wrap(asciify(String(cells[i])), "R", size, widths[i] - padX * 2);
        let ty = yTop - padY - size;
        for (const line of lines) {
          const fid = isHeader ? FONTS.B.id : FONTS.R.id;
          this.current.push(
            `BT 0 0 0 rg /${fid} ${size} Tf ${(xCursor + padX).toFixed(2)} ${ty.toFixed(2)} Td (${escapePdf(line)}) Tj ET`
          );
          ty -= size + 2;
        }
        xCursor += widths[i];
      }
      this.cursorY = yBottom;
    };
    drawRow(headers, true);
    for (const row of rows) drawRow(row, false);
    this.cursorY -= 8;
  }
  build() {
    const objects = [];
    const addObj = (body) => { objects.push(body); return objects.length; };
    // Reserve object numbers
    // 1: Catalog, 2: Pages, then per page: Page + Contents, then fonts at end
    const catalogNum = 1;
    const pagesNum = 2;
    objects.push(""); objects.push(""); // placeholders for 1 and 2

    const pageNums = [];
    const contentNums = [];
    for (const page of this.pages) {
      const stream = page.join("\n");
      const contentNum = addObj(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
      contentNums.push(contentNum);
      const pageNum = addObj(""); // placeholder, fill in after fonts known
      pageNums.push(pageNum);
    }
    const fontNums = {};
    for (const key of Object.keys(FONTS)) {
      const f = FONTS[key];
      fontNums[f.id] = addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /${f.name} /Encoding /WinAnsiEncoding >>`);
    }

    // Now fill page objects
    const fontDict = Object.entries(fontNums).map(([id, num]) => `/${id} ${num} 0 R`).join(" ");
    pageNums.forEach((pageNum, i) => {
      objects[pageNum - 1] =
        `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << ${fontDict} >> >> /Contents ${contentNums[i]} 0 R >>`;
    });

    objects[catalogNum - 1] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
    const kids = pageNums.map(n => `${n} 0 R`).join(" ");
    objects[pagesNum - 1] = `<< /Type /Pages /Count ${pageNums.length} /Kids [${kids}] >>`;

    // Serialize
    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [0];
    for (let i = 0; i < objects.length; i++) {
      offsets.push(Buffer.byteLength(pdf, "binary"));
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xrefPos = Buffer.byteLength(pdf, "binary");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return Buffer.from(pdf, "binary");
  }
}

// ──────────────────────────────────────────────────────────────────
// Build the document
// ──────────────────────────────────────────────────────────────────
const doc = new PdfBuilder();

doc.heading("JC ON THE MOVE - Current System Blueprint", 1);
doc.paragraph(
  "Snapshot of the application's customer, crew, and admin surfaces as of April 2026. " +
  "Use this as a markup sheet: circle what to keep, cross out what to retire, and add notes for what is missing.",
  { font: "O", size: 10, after: 10 }
);

// A
doc.heading("A. Three Audiences, Three Apps (one codebase)", 2);
doc.table(
  ["Audience", "Bottom-tab home", "Where they do work"],
  [
    ["Customer", "/ or /hub", "Booking, wallet, rewards, mining, jobs"],
    ["Crew / Worker", "/crew", "Today, Jobs, Schedule, Earnings"],
    ["Admin", "/admin", "Overview, Jobs, People, Finance, Pricing, etc."],
  ],
  [0.22, 0.22, 0.56],
);

// B
doc.heading("B. Customer Booking Surfaces (where the inconsistency lives)", 2);
doc.paragraph(
  "There are 8 different ways a customer can start a job. They overlap heavily.",
  { after: 6 }
);
doc.table(
  ["#", "Route", "What it is", "Services covered", "Flow style"],
  [
    ["1", "/ Homepage", "Service tiles", "All 14", "Sends to /book?service=X"],
    ["2", "/hub", "Customer hub", "All 14", "Embeds the chatbot"],
    ["3", "/book", "Multi-service cart wizard", "All 14", "Step-by-step form"],
    ["4", "/book/chat", "Dedicated chatbot page", "All 14", "Conversational"],
    ["5", "/book/lawn-care", "Lawn-care 3-step wizard", "Lawn only", "Form"],
    ["6", "/post-job", "Post a Job, Step 1 of 3", "Only 10 of 14", "Form + packages"],
    ["7", "/packages", "JC222 / JC272 picker", "Moving + Junk", "Package list"],
    ["8", "Service landing pages", "One page per service", "Lawn, Window, Cleaning, Roofing, Demo, Snow, Trash Valet", "Each one different"],
  ],
  [0.04, 0.18, 0.22, 0.28, 0.28],
);
doc.paragraph("Problems this creates:", { font: "B", size: 10, after: 4 });
doc.bullet("Click 'Moving' on / can land you in /book, /book/chat, /packages, OR /post-job depending on entry.");
doc.bullet("Worker 'Add a Job' buttons send them into the customer /post-job flow that is missing 4 services.");
doc.bullet("The chatbot exists and works, but is bypassed entirely on /post-job and /packages.");
doc.bullet("Each service landing page hands off to a different next-step (sometimes chatbot, sometimes its own form).");
doc.bullet("Your handwritten 'Click a service -> asked to click a service AGAIN' complaint = the /post-job Step 1 -> Step 2 service pivot.");
doc.cursorY -= 4;

// C
doc.heading("C. The 14 Services & Which Flow Owns Them Today", 2);
doc.table(
  ["Service", "Key", "Today's flow", "Pkg pricing?", "Chatbot?", "Landing page?"],
  [
    ["Moving", "residential", "Packages on /post-job", "Yes - JC222, JC272, Heavy Item", "Yes - full intake", "-"],
    ["Junk Removal", "junk", "Packages on /post-job", "Yes - Tier 1-4", "Yes - full intake", "-"],
    ["Snow Removal", "snow", "Form", "Yes - $50/visit, $2,500/yr", "Yes - quote-only", "/snow-removal"],
    ["Handyman", "handyman", "Form", "From $150", "Yes - quote-only", "-"],
    ["Flooring", "flooring", "Form", "-", "Yes - quote-only", "-"],
    ["Painting", "painting", "Form", "-", "Yes - quote-only", "-"],
    ["Lawn Care", "lawn_care", "Dedicated wizard", "From $50", "Yes - quote-only", "/lawn-care"],
    ["Window Cleaning", "window_cleaning", "Landing -> chatbot", "$5/pane, $20 min", "Yes - full intake", "/window-cleaning"],
    ["Trash Valet", "trash_valet", "Dedicated wizard", "$30/mo, $6 first can", "Yes - full intake", "/trash-valet"],
    ["Move Cleaning", "cleaning", "MISSING on /post-job", "$300+, deep $500+", "Yes - quote-only", "/cleaning"],
    ["Demolition", "demolition", "MISSING on /post-job", "-", "Yes - quote-only", "/demolition"],
    ["Roofing", "roofing", "MISSING on /post-job", "-", "Yes - quote-only", "/roofing"],
    ["Labor Only", "labor", "MISSING on /post-job", "$75/hr, 2hr min", "-", "-"],
    ["Something Else", "custom", "Form", "-", "Yes - quote-only", "-"],
  ],
  [0.16, 0.13, 0.18, 0.20, 0.17, 0.16],
);

// D
doc.heading("D. Pricing - Where It Lives", 2);
doc.table(
  ["Where", "What's there"],
  [
    ["client/src/pages/pricing.tsx", "Customer-facing rate sheet (Junk tiers, Lawn, Windows, Trash Valet, etc.)"],
    ["client/src/pages/service-packages.tsx", "JC222 / JC272 / Heavy Item / Oversized / 2 Movers x N hrs grid"],
    ["attached_assets/pricing_*.ts", "Labor $75/hr, Truck $300/$600 - referenced in places"],
    ["client/src/pages/post-job.tsx", "PACKAGE_SERVICES hardcoded list (Moving + Junk only get packages here)"],
    ["booking-chatbot.tsx", "Inline pricing logic for the 5 instant-quote services"],
  ],
  [0.36, 0.64],
);
doc.paragraph(
  "There is no single source of truth for pricing. Your handwritten notes (the moving matrix by bedroom x stairs x load type, " +
  "junk tiers Tiny -> X-Large -> Custom, snow $50 / $2,500/yr / $3,800 w-rod, windows by pane size) do not live anywhere in code yet.",
  { font: "O", size: 10 }
);

// E
doc.heading("E. Worker Side - How a Crew Member Books or Adds Work", 2);
doc.table(
  ["Where", "Button", "Goes to"],
  [
    ["/crew (Today)", "Claim daily reward", "/mining (was broken, now fixed)"],
    ["/crew/jobs", "Add Lead", "/post-job (customer flow, missing 4 services)"],
    ["/employee-home", "Add a Job", "/post-job (wrong)"],
    ["/employee-dashboard", "Add a Job", "/post-job (wrong)"],
    ["/hub", "Add a Job", "/post-job (wrong)"],
    ["/employee/add-job", "(no button points here)", "Dedicated worker job-entry flow - exists but ORPHANED"],
  ],
  [0.22, 0.22, 0.56],
);

// F
doc.heading("F. The 'Uniform Autonomous System' Gap", 2);
doc.paragraph(
  "Your concern about 'multiple inconsistent landing pages trying to separately do the work of a system " +
  "that I want to uniformly and autonomously run' translates to these concrete gaps:",
  { after: 6 }
);
doc.bullet("No single quoting brain. Pricing rules live in 5+ files. Chatbot, packages page, pricing page, and your handwritten matrix are all separate.");
doc.bullet("No single entry point. /, /hub, /book, /book/chat, /post-job, /packages, and 7 service landing pages all do overlapping work.");
doc.bullet("Worker tools borrow the customer flow. /post-job is used by both audiences but is incomplete for both.");
doc.bullet("The chatbot you already built is underused. It is wired to /book/chat, /hub, and 4 of 14 service landing pages - but Moving and Junk (highest volume) bypass it.");
doc.bullet("Pricing display is not the pricing engine. /pricing shows numbers, but those numbers are not what gets used to actually quote a job.");

// G
doc.heading("G. Decisions I Need From You", 2);
doc.paragraph("Mark these up and send them back. I will turn your edits into a concrete task list.", { after: 6 });
doc.paragraph("1. One booking front door, or many?", { font: "B", size: 10, after: 2 });
doc.paragraph("Should every 'Get a quote' button anywhere in the app land on the same flow (likely the chatbot), or should some services keep their dedicated landing pages?", { indent: 14, after: 6 });
doc.paragraph("2. Packages or dynamic quoting for Moving / Junk?", { font: "B", size: 10, after: 2 });
doc.paragraph("Keep JC222 / JC272 as the customer experience, replace with the weight-tier engine from your ChatGPT notes, or offer both?", { indent: 14, after: 6 });
doc.paragraph("3. One pricing source of truth?", { font: "B", size: 10, after: 2 });
doc.paragraph("Should pricing (your handwritten matrix included) be consolidated into a single module that the chatbot, packages, /pricing, and admin override panel all read from?", { indent: 14, after: 6 });
doc.paragraph("4. Worker job-entry split.", { font: "B", size: 10, after: 2 });
doc.paragraph("Should the orphaned /employee/add-job become the worker default, or do we delete it and just fix /post-job to serve both audiences?", { indent: 14, after: 6 });
doc.paragraph("5. Service catalog completeness.", { font: "B", size: 10, after: 2 });
doc.paragraph("Are all 14 services in services.ts actually services you offer - or should some get retired so the catalog matches reality?", { indent: 14, after: 6 });

doc.cursorY -= 10;
doc.rule();
doc.paragraph(
  "Generated by Replit Agent for Darrell @ JC ON THE MOVE LLC.",
  { font: "O", size: 9, color: "0.4 0.4 0.4" }
);

mkdirSync("exports", { recursive: true });
const out = doc.build();
writeFileSync("exports/jc-blueprint.pdf", out);
console.log(`Wrote exports/jc-blueprint.pdf (${out.length} bytes)`);
