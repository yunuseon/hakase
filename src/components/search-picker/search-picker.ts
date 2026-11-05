export type Choice = {
    readonly value: string;
    readonly label: string;
    readonly hint: string;
};

export type PickerView = {
    readonly title: string;
    readonly options: readonly Choice[];
    readonly selected: readonly string[];
    readonly multiple: boolean;
    readonly create: boolean;
};

export const nextChoiceIndex = (current: number, count: number, direction: number): number =>
    count === 0
        ? -1
        : current < 0
          ? direction > 0
              ? 0
              : count - 1
          : (current + direction + count) % count;

export const matchedChoices = (options: readonly Choice[], query: string): readonly Choice[] => {
    const words = query
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word !== '');

    return options.filter(option =>
        words.every(word => `${option.label} ${option.hint}`.toLowerCase().includes(word)),
    );
};

export const choicesFor = (view: PickerView, query: string): readonly Choice[] => {
    const found = matchedChoices(view.options, query);
    const value = query.trim().replace(/\s+/g, ' ').toLowerCase();

    return view.create &&
        value !== '' &&
        !view.options.some(option => option.value.toLowerCase() === value)
        ? [...found, { value, label: `Create “${value}”`, hint: 'New tag' }]
        : found;
};

export const selectionLabel = (view: PickerView): string =>
    view.selected.length === 0
        ? 'None'
        : view.selected
              .map(value => view.options.find(option => option.value === value)?.label ?? value)
              .join(', ');
