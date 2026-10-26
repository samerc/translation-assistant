import bidiFactory from 'bidi-js';

/**
 * Unicode-aware text for pdfkit.
 *
 * pdfkit's built-in Helvetica only covers WinAnsi, so names and addresses in
 * Arabic, Cyrillic, Greek, Vietnamese… came out as garbage. We embed Noto Sans
 * (Latin/Cyrillic/Greek/Vietnamese) and Noto Sans Arabic instead.
 *
 * fontkit (inside pdfkit) shapes Arabic and reverses an Arabic run, but does no
 * bidi layout: mixed lines ("Invoice INV-0001 للعميل") come out scrambled, and
 * pdfkit's word wrapping drops the spaces between Arabic words. So for text
 * that contains right-to-left characters we wrap lines ourselves, split each
 * line into direction runs in visual order (Unicode bidi via bidi-js), and draw
 * each run on its own — an RTL run as one unbreakable token (spaces → NBSP) so
 * fontkit shapes and reverses it as a whole. Plain left-to-right text uses the
 * same path, which keeps measuring and pagination identical for both.
 *
 * Not covered: scripts outside these fonts (CJK, Hebrew, Thai, Devanagari…).
 */

const FONT_FILES = {
  sans: '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf',
  'sans-bold': '@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf',
  arabic:
    '@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf',
  'arabic-bold':
    '@expo-google-fonts/noto-sans-arabic/700Bold/NotoSansArabic_700Bold.ttf',
} as const;

const RTL_CHARS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_CHARS =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

const bidi = bidiFactory();

export interface TextStyle {
  size: number;
  bold?: boolean;
  color?: string;
}

/** start/end follow the line's direction (start = right for Arabic);
 *  left/right are fixed (e.g. a block that is a left-hand column). */
export type TextAlign = 'start' | 'end' | 'center' | 'left' | 'right';

interface Run {
  text: string;
  arabic: boolean;
}

export class PdfText {
  constructor(private readonly doc: PDFKit.PDFDocument) {
    for (const [name, file] of Object.entries(FONT_FILES)) {
      doc.registerFont(name, require.resolve(file));
    }
  }

  private use(style: TextStyle, arabic = false): void {
    this.doc
      .font(`${arabic ? 'arabic' : 'sans'}${style.bold ? '-bold' : ''}`)
      .fontSize(style.size);
    if (style.color) this.doc.fillColor(style.color);
  }

  lineHeight(style: TextStyle): number {
    this.use(style);
    return this.doc.currentLineHeight(true);
  }

  /** Visual-order runs of one line. */
  private runs(line: string): { runs: Run[]; rtl: boolean } {
    if (!RTL_CHARS.test(line))
      return { runs: [{ text: line, arabic: false }], rtl: false };

    const levels = bidi.getEmbeddingLevels(line, 'auto');
    const order = [...Array(line.length).keys()];
    for (const [start, end] of bidi.getReorderSegments(line, levels)) {
      const reversed = order.slice(start, end + 1).reverse();
      order.splice(start, reversed.length, ...reversed);
    }

    const runs: Run[] = [];
    let from = 0;
    for (let i = 1; i <= order.length; i++) {
      const prev = order[i - 1];
      const rtl = levels.levels[prev] % 2 === 1;
      const continues =
        i < order.length &&
        levels.levels[order[i]] % 2 === levels.levels[prev] % 2 &&
        order[i] === prev + (rtl ? -1 : 1);
      if (continues) continue;
      const lo = Math.min(order[from], prev);
      const hi = Math.max(order[from], prev);
      const text = line.slice(lo, hi + 1);
      runs.push({
        // One token per RTL run, so pdfkit never splits or reorders its words.
        text: rtl ? text.replace(/ /g, '\u00A0') : text,
        arabic: ARABIC_CHARS.test(text),
      });
      from = i;
    }
    return { runs, rtl: levels.paragraphs[0]?.level === 1 };
  }

  private width(runs: Run[], style: TextStyle): number[] {
    return runs.map((r) => {
      this.use(style, r.arabic);
      return this.doc.widthOfString(r.text);
    });
  }

  private measure(line: string, style: TextStyle): number {
    return this.width(this.runs(line).runs, style).reduce((a, b) => a + b, 0);
  }

  /** Word-wrap to `width` (paragraphs on newlines). A word wider than the
   *  box gets a line of its own. */
  lines(text: string, width: number, style: TextStyle): string[] {
    const out: string[] = [];
    for (const para of String(text ?? '').split(/\r?\n/)) {
      const words = para.split(/ +/).filter(Boolean);
      if (words.length === 0) {
        out.push('');
        continue;
      }
      let line = words[0];
      for (const word of words.slice(1)) {
        const candidate = `${line} ${word}`;
        if (this.measure(candidate, style) <= width) line = candidate;
        else {
          out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }

  height(text: string, width: number, style: TextStyle): number {
    return this.lines(text, width, style).length * this.lineHeight(style);
  }

  /** Draw one already-wrapped line at (x, y) inside a box `width` wide. */
  drawLine(
    line: string,
    x: number,
    y: number,
    width: number,
    style: TextStyle,
    align: TextAlign = 'start',
  ): void {
    const { runs, rtl } = this.runs(line);
    const widths = this.width(runs, style);
    const total = widths.reduce((a, b) => a + b, 0);
    const right =
      align === 'right' ||
      (align === 'end' && !rtl) ||
      (align === 'start' && rtl);
    let cx =
      align === 'center'
        ? x + (width - total) / 2
        : right
          ? x + width - total
          : x;
    // pdfkit positions text by each font's ascender, and Noto Sans Arabic's is
    // taller — so put every run on one alphabetic baseline (the Latin font's).
    this.use(style);
    const font = (this.doc as unknown as { _font: { ascender: number } })._font;
    const baseline = y + (font.ascender / 1000) * style.size;
    runs.forEach((run, i) => {
      this.use(style, run.arabic);
      this.doc.text(run.text, cx, baseline, {
        lineBreak: false,
        baseline: 'alphabetic',
      });
      cx += widths[i];
    });
  }

  /** Draw wrapped text; returns the y just below it. No page breaks — callers
   *  that may overflow a page use lines() + drawLine() themselves. */
  draw(
    text: string,
    x: number,
    y: number,
    width: number,
    style: TextStyle,
    align: TextAlign = 'start',
  ): number {
    const lh = this.lineHeight(style);
    for (const line of this.lines(text, width, style)) {
      this.drawLine(line, x, y, width, style, align);
      y += lh;
    }
    return y;
  }
}
