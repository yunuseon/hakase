import {
    isMode,
    MAX_WEIGHT,
    MIN_WEIGHT,
    MODES,
    type Pen,
    type PenCommand,
} from '../../model/pen.ts';
import {
    numberOf,
    section,
    textOf,
    type PropertyChange,
    type Section,
} from '../../shared/properties.ts';

export const penSections = ({ mode, weight }: Pen): readonly Section[] => [
    section(
        'pen',
        null,
        [
            {
                kind: 'choice',
                id: 'mode',
                label: 'shows',
                value: mode,
                options: MODES.map(each => ({ value: each, label: each })),
                hint: 'whole: the finished figure; draw: the line up to the playhead, starting again with the loop',
            },
            {
                kind: 'range',
                id: 'weight',
                label: 'weight',
                value: weight,
                min: MIN_WEIGHT,
                max: MAX_WEIGHT,
                step: 0.25,
                text: weight.toFixed(1),
                hint: 'how thick the line is; a size signal swells it',
            },
        ],
        false,
    ),
];

export const penCommandOf = (change: PropertyChange): PenCommand[] => {
    const mode = textOf(change) ?? '';
    const weight = numberOf(change);

    return change.id === 'mode' && isMode(mode)
        ? [{ kind: 'mode', mode }]
        : change.id === 'weight' && weight !== null
          ? [{ kind: 'weight', weight }]
          : [];
};
