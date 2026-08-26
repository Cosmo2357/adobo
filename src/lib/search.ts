import type { PDFDocumentProxy } from "./pdf";

export interface Match {
  page: number;
  item: number;
  offset: number;
  length: number;
}

/**
 * Per-page text item strings, index-aligned with the spans the TextLayer
 * builds for the same page (both skip marked-content items).
 */
export class TextIndex {
  private pages = new Map<number, string[]>();
  private loading = new Map<number, Promise<string[]>>();

  constructor(private doc: PDFDocumentProxy) {}

  itemsFor(page: number): Promise<string[]> {
    const cached = this.pages.get(page);
    if (cached) return Promise.resolve(cached);
    let pending = this.loading.get(page);
    if (!pending) {
      pending = this.doc.getPage(page + 1).then(async (p) => {
        const content = await p.getTextContent();
        const strs = content.items.map((it) => ("str" in it ? it.str : ""));
        this.pages.set(page, strs);
        this.loading.delete(page);
        return strs;
      });
      this.loading.set(page, pending);
    }
    return pending;
  }

  /** Finds case-insensitive occurrences of `query` within single text items. */
  async search(query: string, signal?: AbortSignal): Promise<Match[]> {
    const q = query.toLowerCase();
    const matches: Match[] = [];
    if (!q) return matches;
    for (let page = 0; page < this.doc.numPages; page++) {
      if (signal?.aborted) return matches;
      const items = await this.itemsFor(page);
      for (let item = 0; item < items.length; item++) {
        const hay = items[item].toLowerCase();
        let from = 0;
        for (;;) {
          const at = hay.indexOf(q, from);
          if (at === -1) break;
          matches.push({ page, item, offset: at, length: q.length });
          from = at + q.length;
        }
      }
    }
    return matches;
  }
}
