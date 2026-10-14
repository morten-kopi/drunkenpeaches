import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  guestLabel,
  headcount,
  lunchWhenWhere,
  type RestaurantLunch,
  type RestaurantRow,
} from "@/lib/restaurant-list";

// A4 in points.
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const FOOTER_Y = 30;
const TEXT = rgb(0.16, 0.15, 0.14);
const MUTED = rgb(0.47, 0.44, 0.42);
const RULE = rgb(0.85, 0.83, 0.81);

const BODY = 10;
const LINE = 13;
const PAD = 6;

const COLUMNS = [
  { key: "n", label: "#", width: 24 },
  { key: "name", label: "Name", width: 160 },
  { key: "guests", label: "Guests", width: 150 },
  { key: "dietary", label: "Dietary notes", width: PAGE_W - 2 * MARGIN - 334 },
] as const;

// Letters with a stroke have no accent to strip.
const STROKED: Record<string, string> = { Đ: "D", đ: "d", Ł: "L", ł: "l", Ħ: "H", ħ: "h", ı: "i" };

/**
 * The standard PDF fonts only cover Latin-1. Keep what they can draw, strip
 * accents they can't, and show anything else as "?" rather than failing.
 */
function drawable(font: PDFFont, text: string) {
  const supported = new Set(font.getCharacterSet());
  const ok = (s: string) =>
    Array.from(s).every((c) => supported.has(c.codePointAt(0)!));
  return Array.from(text.replace(/\s+/g, " ").trim())
    .map((c) => {
      if (ok(c)) return c;
      const base = STROKED[c] ?? c.normalize("NFD").replace(/\p{M}/gu, "");
      return base && ok(base) ? base : "?";
    })
    .join("");
}

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word wider than the column is split across lines.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) {
        cut--;
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** The restaurant list as an A4 PDF: header, headcount, one row per member. */
export async function restaurantListPdf(opts: {
  clubName: string;
  lunch: RestaurantLunch;
  rows: RestaurantRow[];
  generatedAt: string;
}) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${opts.lunch.title}: restaurant list`);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const text = (
    value: string,
    x: number,
    size: number,
    font: PDFFont,
    color = TEXT
  ) => page.drawText(drawable(font, value), { x, y, size, font, color });

  // Header
  y -= 10;
  text(opts.clubName, MARGIN, 10, regular, MUTED);
  y -= 26;
  for (const line of wrap(bold, drawable(bold, opts.lunch.title), 20, PAGE_W - 2 * MARGIN)) {
    text(line, MARGIN, 20, bold);
    y -= 24;
  }
  y += 4;
  text(lunchWhenWhere(opts.lunch), MARGIN, 11, regular);
  y -= 24;

  const guests = opts.rows.reduce((n, r) => n + r.guests, 0);
  text(`Final headcount: ${headcount(opts.rows)}`, MARGIN, 13, bold);
  y -= 16;
  text(
    `${opts.rows.length} member${opts.rows.length === 1 ? "" : "s"}` +
      (guests ? `, ${guests} guest${guests === 1 ? "" : "s"}` : ""),
    MARGIN,
    10,
    regular,
    MUTED
  );
  y -= 28;

  const drawTableHeader = () => {
    let x = MARGIN;
    for (const col of COLUMNS) {
      text(col.label, x, 9, bold, MUTED);
      x += col.width;
    }
    y -= PAD;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.75,
      color: MUTED,
    });
    y -= LINE;
  };
  drawTableHeader();

  opts.rows.forEach((row, i) => {
    const cells: Record<(typeof COLUMNS)[number]["key"], string[]> = {
      n: [String(i + 1)],
      name: wrap(bold, drawable(bold, row.name), BODY, COLUMNS[1].width - PAD),
      guests: wrap(regular, drawable(regular, guestLabel(row)), BODY, COLUMNS[2].width - PAD),
      dietary: wrap(regular, drawable(regular, row.dietary ?? ""), BODY, COLUMNS[3].width),
    };
    const lines = Math.max(...Object.values(cells).map((c) => c.length));
    const height = lines * LINE;

    if (y - height < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN - 10;
      drawTableHeader();
    }

    const top = y;
    let x = MARGIN;
    for (const col of COLUMNS) {
      y = top;
      for (const line of cells[col.key]) {
        text(line, x, BODY, col.key === "name" ? bold : regular);
        y -= LINE;
      }
      x += col.width;
    }
    y = top - height + LINE - PAD;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: RULE,
    });
    y -= LINE;
  });

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const footer = drawable(
      regular,
      `Generated ${opts.generatedAt}` +
        (pages.length > 1 ? `. Page ${i + 1} of ${pages.length}` : "")
    );
    p.drawText(footer, { x: MARGIN, y: FOOTER_Y, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}
