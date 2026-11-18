import { section, type PropertyChange, type Section } from '../../shared/properties.ts';

export type KnobView = {
    readonly name: string;
    readonly min: number;
    readonly max: number;
    readonly step: number;
    readonly value: number;
    readonly driven: boolean;
    readonly chain: string;
};

export type PedalView = {
    readonly summary: string;
    readonly knobs: readonly KnobView[];
    readonly choices: readonly string[];
    readonly choice: string;
    readonly inputs: readonly { readonly name: string; readonly from: string | null }[];
};

export type PedalChange =
    | { readonly kind: 'value'; readonly name: string; readonly value: number }
    | { readonly kind: 'choice'; readonly choice: string };

export const readout = (value: number, step: number): string =>
    value.toFixed(step >= 1 ? 0 : step >= 0.01 ? 2 : 3);

export const pedalSections = ({ knobs, choices, choice }: PedalView): readonly Section[] => [
    section(
        'pedal',
        null,
        [
            ...(choices.length === 0
                ? []
                : [
                      {
                          kind: 'choice' as const,
                          id: 'choice',
                          label: 'mode',
                          value: choice,
                          options: choices.map(each => ({ value: each, label: each })),
                      },
                  ]),
            ...knobs.map(knob => ({
                kind: 'range' as const,
                id: `knob.${knob.name}`,
                label: knob.name,
                value: knob.value,
                min: knob.min,
                max: knob.max,
                step: knob.step,
                text: readout(knob.value, knob.step),
                ...(knob.driven ? { driven: { why: knob.name, chain: knob.chain } } : {}),
            })),
        ],
        false,
    ),
];

export const pedalChangeOf = ({ id, value }: PropertyChange): PedalChange[] =>
    id === 'choice' && typeof value === 'string'
        ? [{ kind: 'choice', choice: value }]
        : id.startsWith('knob.') && typeof value === 'number'
          ? [{ kind: 'value', name: id.slice('knob.'.length), value }]
          : [];
