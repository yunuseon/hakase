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
    | { readonly kind: 'none'; readonly title: string };

export type BarView = {
    readonly state: 'now' | 'paused' | 'next' | 'none';
    readonly title: string;
    readonly detail: string;
    readonly fill: number;
    readonly start: string;
    readonly end: string;
};

export const durationText = (ms: number): string => {
    const seconds = Math.max(Math.ceil(ms / 1000), 0);

    if (seconds < 600) {
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    }

    const minutes = Math.ceil(seconds / 60);

    return minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
};

export const barView = (reading: Reading): BarView => {
    switch (reading.kind) {
        case 'now':
            return {
                state: reading.running ? 'now' : 'paused',
                title: reading.title,
                detail: `${durationText(reading.remaining)} left${reading.running ? '' : ' · paused'}`,
                fill: Math.min(Math.max(reading.at, 0), 1),
                start: reading.span?.start ?? '',
                end: reading.span?.end ?? '',
            };
        case 'next':
            return {
                state: 'next',
                title: `Next: ${reading.title}`,
                detail: `in ${durationText(reading.remaining)}`,
                fill: 0,
                start: reading.span.start,
                end: reading.span.end,
            };
        case 'none':
            return { state: 'none', title: reading.title, detail: '', fill: 0, start: '', end: '' };
    }
};
