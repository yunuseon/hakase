export type SelectOption = {
    readonly value: string;
    readonly label: string;
    readonly disabled: boolean;
};

export type SelectConfig = {
    readonly options: readonly SelectOption[];
    readonly value: string;
    readonly disabled: boolean;
    readonly editable: boolean;
    readonly label: string;
    readonly placeholder: string;
};

export type SelectSession = {
    readonly config: SelectConfig;
    readonly open: boolean;
    readonly query: string;
    readonly active: number;
    readonly write: string | null;
    readonly chosen: boolean;
    readonly submit: boolean;
    readonly focus: boolean;
};

export type SelectAction =
    | { readonly kind: 'config'; readonly config: SelectConfig }
    | { readonly kind: 'toggle' }
    | { readonly kind: 'query'; readonly text: string }
    | { readonly kind: 'key'; readonly key: string }
    | { readonly kind: 'choose'; readonly value: string }
    | { readonly kind: 'close'; readonly focus: boolean };

export const emptySelect: SelectSession = {
    config: {
        options: [],
        value: '',
        disabled: false,
        editable: false,
        label: 'Select option',
        placeholder: '',
    },
    open: false,
    query: '',
    active: -1,
    write: null,
    chosen: false,
    submit: false,
    focus: false,
};

export const matchingOptions = (config: SelectConfig, query: string): readonly SelectOption[] => {
    const words = query.toLowerCase().trim().split(/\s+/);
    return config.options.filter(option =>
        words.every(word => option.label.toLowerCase().includes(word)),
    );
};

const activeOnOpen = (config: SelectConfig, options: readonly SelectOption[]): number => {
    const selected = options.findIndex(option => option.value === config.value && !option.disabled);
    return config.editable
        ? -1
        : selected >= 0
          ? selected
          : options.findIndex(option => !option.disabled);
};

const stepped = (options: readonly SelectOption[], current: number, direction: number): number => {
    const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
    const at = enabled.indexOf(current);
    return enabled.length === 0
        ? -1
        : (enabled[
              at < 0
                  ? direction > 0
                      ? 0
                      : enabled.length - 1
                  : (at + direction + enabled.length) % enabled.length
          ] ?? -1);
};

export const reduceSelect = (state: SelectSession, action: SelectAction): SelectSession => {
    const next = { ...state, write: null, chosen: false, submit: false, focus: false };
    if (action.kind === 'config') {
        const config = action.config;
        const changed = config.value !== state.config.value;
        const query = config.editable && changed ? config.value : state.query;
        const options = matchingOptions(config, query);
        const previous = matchingOptions(state.config, state.query)[state.active]?.value;
        const active = options.findIndex(option => option.value === previous && !option.disabled);
        return {
            ...next,
            config,
            query,
            open:
                state.open &&
                !config.disabled &&
                (!config.editable || !changed || config.value === state.query),
            active: active >= 0 ? active : activeOnOpen(config, options),
        };
    }
    if (action.kind === 'close') {
        return { ...next, open: false, focus: action.focus };
    }
    if (state.config.disabled) {
        return { ...next, open: false };
    }
    const options = matchingOptions(state.config, state.query);
    if (action.kind === 'toggle') {
        return {
            ...next,
            open: !state.open,
            query: state.config.editable ? state.config.value : '',
            active: activeOnOpen(state.config, state.config.options),
        };
    }
    if (action.kind === 'query') {
        const found = matchingOptions(state.config, action.text);
        return {
            ...next,
            query: action.text,
            open: true,
            active: state.config.editable ? -1 : stepped(found, -1, 1),
            write: state.config.editable ? action.text : null,
        };
    }
    if (action.kind === 'choose') {
        const option = state.config.options.find(
            option => option.value === action.value && !option.disabled,
        );
        return option === undefined
            ? next
            : {
                  ...next,
                  open: false,
                  query: state.config.editable ? option.value : '',
                  write: option.value,
                  chosen: true,
                  focus: true,
              };
    }
    const key = action.key;
    if (key === 'Escape' || key === 'Tab') {
        return { ...next, open: false, focus: key === 'Escape' };
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
        const query = state.open ? state.query : state.config.editable ? state.config.value : '';
        const found = matchingOptions(state.config, query);
        return {
            ...next,
            open: true,
            query,
            active: stepped(found, state.open ? state.active : -1, key === 'ArrowDown' ? 1 : -1),
        };
    }
    if (key === 'Home' || key === 'End') {
        return { ...next, open: true, active: stepped(options, -1, key === 'Home' ? 1 : -1) };
    }
    if (key === 'Enter' || key === ' ') {
        const option = state.open ? options[state.active] : undefined;
        return option !== undefined
            ? reduceSelect(state, { kind: 'choose', value: option.value })
            : state.config.editable
              ? { ...next, open: false, submit: key === 'Enter' }
              : {
                    ...next,
                    open: true,
                    query: '',
                    active: activeOnOpen(state.config, state.config.options),
                };
    }
    return next;
};

export const popupPlacement = (
    rect: {
        readonly left: number;
        readonly top: number;
        readonly bottom: number;
        readonly width: number;
    },
    viewport: { readonly width: number; readonly height: number },
) => {
    const below = viewport.height - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < 180 && above > below;
    const width = Math.min(Math.max(rect.width, 190), Math.max(0, viewport.width - 16));
    return {
        left: Math.max(8, Math.min(rect.left, viewport.width - width - 8)),
        top: up ? null : Math.max(8, rect.bottom + 4),
        bottom: up ? Math.max(8, viewport.height - rect.top + 4) : null,
        width,
        height: Math.max(60, Math.min(300, up ? above : below)),
    };
};
