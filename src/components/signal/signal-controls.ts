import {
    FIELDS,
    isField,
    isParam,
    type Field,
    type Signal,
    type SignalCommand,
    type Wave,
} from '../../shared/signal.ts';
import {
    section,
    type Property,
    type PropertyChange,
    type Section,
} from '../../shared/properties.ts';
import { dragStep, typedValue, valueText } from './signal.ts';

const HINTS: Readonly<Record<Field, string>> = {
    phase: 'where in its cycle the loop starts: drag, or click to type degrees',
    offset: 'the centre the wave swings around: drag, or click to type any number',
    depth: 'how far the wave swings either side, negative flips it: drag, or click to type',
    glide: 'how much of each step eases into the next: drag, or click to type a percentage',
};

export const signalSections = (
    signal: Signal,
    mods: Wave['mods'],
    lines: ReadonlyMap<string, string>,
): readonly Section[] => [
    section(
        'wave',
        null,
        FIELDS.filter(field => field !== 'glide' || signal.shape === 'steps').map(
            (field): Property => {
                const driven = isParam(field) && mods[field] !== null;

                return {
                    kind: 'drag',
                    id: field,
                    label: field,
                    hint: HINTS[field],
                    text: valueText(field, signal[field]),
                    step: dragStep(field, false),
                    fine: dragStep(field, true),
                    ...(driven ? { driven: { why: field, chain: lines.get(field) ?? '' } } : {}),
                };
            },
        ),
        false,
    ),
];

export const signalCommandOf = ({ id, value, nudge }: PropertyChange): SignalCommand[] => {
    if (!isField(id)) {
        return [];
    }

    if (nudge === true) {
        return typeof value === 'number' ? [{ kind: 'nudge', param: id, by: value }] : [];
    }

    const typed = typeof value === 'string' ? typedValue(id, value) : null;

    return typed === null ? [] : [{ kind: 'set', param: id, value: typed }];
};
