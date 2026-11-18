export type Span = { readonly start: string; readonly end: string };

export type Reading =
    | {
          readonly kind: 'now';
          readonly title: string;
          readonly at: number;
          readonly remaining: number;
          readonly running: boolean;
          readonly span: Span | null;
      }
    | {
          readonly kind: 'next';
          readonly title: string;
          readonly remaining: number;
          readonly span: Span;
      }
    | {
          readonly kind: 'count';
          readonly title: string;
          readonly done: number;
          readonly total: number;
      }
    | { readonly kind: 'none'; readonly title: string };
