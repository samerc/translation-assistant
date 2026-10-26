// Minimal typings for bidi-js (the package ships none) — only what pdf-text.ts uses.
declare module 'bidi-js' {
  interface EmbeddingLevels {
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  }
  interface Bidi {
    getEmbeddingLevels(
      text: string,
      direction?: 'ltr' | 'rtl' | 'auto',
    ): EmbeddingLevels;
    getReorderSegments(
      text: string,
      levels: EmbeddingLevels,
      start?: number,
      end?: number,
    ): [number, number][];
  }
  export default function bidiFactory(): Bidi;
}
