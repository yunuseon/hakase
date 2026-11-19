import { ordered, type Blend, type Stop, type Theme } from '../../model/sketch/theme.ts';
import { section, type Section } from '../../shared/properties.ts';

export type ThemeEdit =
    | { readonly kind: 'stops'; readonly stops: readonly Stop[] }
    | { readonly kind: 'blend'; readonly blend: Blend }
    | { readonly kind: 'add' }
    | { readonly kind: 'remove'; readonly index: number };

type Gap = {
    readonly size: number;
    readonly at: number;
    readonly color: string;
};

// Splits the widest gap, so repeated adds spread out instead of piling up at an end.
export const withExtraStop = ({ stops, blend }: Theme): Theme => {
    const sorted = ordered(stops);
    const first = sorted[0];

    if (first === undefined) {
        return { blend, stops: [{ at: 0.5, color: '#ffffff' }] };
    }

    if (sorted.length < 2) {
        return {
            blend,
            stops: ordered([...sorted, { at: first.at < 0.5 ? 1 : 0, color: first.color }]),
        };
    }

    const widest = sorted.slice(1).reduce<Gap>(
        (best, stop, index) => {
            const previous = sorted[index] ?? first;
            const size = stop.at - previous.at;

            return size > best.size
                ? { size, at: (previous.at + stop.at) / 2, color: previous.color }
                : best;
        },
        { size: -1, at: 0.5, color: first.color },
    );

    return { blend, stops: ordered([...sorted, { at: widest.at, color: widest.color }]) };
};

// A theme with no stops has no colour at all, so the last one never leaves.
export const withoutStop = ({ stops, blend }: Theme, index: number): Theme =>
    stops.length < 2 ? { stops, blend } : { blend, stops: stops.filter((_, at) => at !== index) };

export const editedTheme = (theme: Theme, edit: ThemeEdit): Theme => {
    switch (edit.kind) {
        case 'stops':
            return { ...theme, stops: ordered(edit.stops) };
        case 'blend':
            return { ...theme, blend: edit.blend };
        case 'add':
            return withExtraStop(theme);
        case 'remove':
            return withoutStop(theme, edit.index);
    }
};

export const themeSections = ({
    theme,
    themes,
    blend,
}: {
    readonly theme: string;
    readonly themes: readonly { readonly value: string; readonly label: string }[];
    readonly blend: Blend;
}): readonly Section[] => [
    section(
        'theme',
        null,
        [
            { kind: 'choice', id: 'theme', label: 'theme', value: theme, options: themes },
            {
                kind: 'choice',
                id: 'blend',
                label: 'blend',
                value: blend,
                options: [
                    { value: 'smooth', label: 'smooth' },
                    { value: 'steps', label: 'steps' },
                ],
                hint: 'smooth runs from stop to stop; steps holds each stop until the next',
            },
        ],
        false,
    ),
];
