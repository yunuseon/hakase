export type StoryArgs = {
    readonly label: string;
    readonly value: number;
    readonly disabled: boolean;
};
export type StoryVariant = { readonly id: string; readonly title: string };
export type StoryInfo = {
    readonly id: string;
    readonly title: string;
    readonly group: string;
    readonly description: string;
    readonly elements: readonly string[];
    readonly variants: readonly StoryVariant[];
    readonly controls: readonly ('label' | 'value' | 'disabled')[];
    readonly defaults: StoryArgs;
    readonly height: number;
    readonly code: string;
    readonly action: string | null;
};
export type BookState = {
    readonly selected: string;
    readonly query: string;
    readonly variant: string;
    readonly appearance: string;
    readonly width: string;
    readonly args: StoryArgs;
    readonly revision: number;
};
export type BookChange =
    | {
          readonly kind: 'select' | 'query' | 'variant' | 'appearance' | 'width' | 'label';
          readonly value: string;
      }
    | { readonly kind: 'value'; readonly value: number }
    | { readonly kind: 'disabled'; readonly value: boolean }
    | { readonly kind: 'reset' | 'action' | 'clear' };
export type StoryEvent = { readonly name: string; readonly detail: string };
export type EventEntry = StoryEvent & { readonly seq: number };
export type EventLog = { readonly next: number; readonly entries: readonly EventEntry[] };
export type LogChange =
    { readonly kind: 'reset' } | { readonly kind: 'event'; readonly event: StoryEvent };
export type BookView = {
    readonly state: BookState;
    readonly story: StoryInfo | null;
    readonly matches: readonly StoryInfo[];
    readonly groups: readonly string[];
    readonly total: number;
    readonly appearances: readonly { readonly value: string; readonly label: string }[];
};

const emptyArgs: StoryArgs = { label: 'Example', value: 35, disabled: false };
export const initialBook = (stories: readonly StoryInfo[]): BookState => ({
    selected: stories[0]?.id ?? '',
    query: '',
    variant: stories[0]?.variants[0]?.id ?? 'default',
    appearance: 'inherit',
    width: 'auto',
    args: stories[0]?.defaults ?? emptyArgs,
    revision: 0,
});

export const reduceBook = (
    state: BookState,
    change: BookChange,
    stories: readonly StoryInfo[],
): BookState => {
    const selected = stories.find(story => story.id === state.selected);
    switch (change.kind) {
        case 'select': {
            const story = stories.find(story => story.id === change.value);
            return story === undefined || story.id === state.selected
                ? state
                : {
                      ...state,
                      selected: story.id,
                      variant: story.variants[0]?.id ?? 'default',
                      args: story.defaults,
                      revision: state.revision + 1,
                  };
        }
        case 'query':
            return { ...state, query: change.value };
        case 'variant':
            return selected?.variants.some(variant => variant.id === change.value) === true
                ? {
                      ...state,
                      variant: change.value,
                      args: selected.defaults,
                      revision: state.revision + 1,
                  }
                : state;
        case 'appearance':
            return { ...state, appearance: change.value };
        case 'width':
            return ['auto', '240', '360', '600'].includes(change.value)
                ? { ...state, width: change.value }
                : state;
        case 'label':
            return { ...state, args: { ...state.args, label: change.value } };
        case 'value':
            return Number.isFinite(change.value)
                ? {
                      ...state,
                      args: { ...state.args, value: Math.max(0, Math.min(100, change.value)) },
                  }
                : state;
        case 'disabled':
            return { ...state, args: { ...state.args, disabled: change.value } };
        case 'reset':
            return {
                ...state,
                args: selected?.defaults ?? emptyArgs,
                revision: state.revision + 1,
            };
        case 'action':
        case 'clear':
            return state;
    }
};

export const bookView = (
    state: BookState,
    stories: readonly StoryInfo[],
    appearances: BookView['appearances'] = [],
): BookView => {
    const words = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = stories.filter(story =>
        words.every(word =>
            `${story.title} ${story.group} ${story.description} ${story.elements.join(' ')}`
                .toLowerCase()
                .includes(word),
        ),
    );
    return {
        state,
        story: stories.find(story => story.id === state.selected) ?? null,
        matches,
        groups: [...new Set(matches.map(story => story.group))],
        total: stories.length,
        appearances,
    };
};
export const sameArgs = (a: StoryArgs, b: StoryArgs): boolean =>
    a.label === b.label && a.value === b.value && a.disabled === b.disabled;
export const emptyLog: EventLog = { next: 1, entries: [] };
export const reduceEventLog = (log: EventLog, change: LogChange): EventLog =>
    change.kind === 'reset'
        ? emptyLog
        : {
              next: log.next + 1,
              entries: [{ ...change.event, seq: log.next }, ...log.entries].slice(0, 12),
          };
