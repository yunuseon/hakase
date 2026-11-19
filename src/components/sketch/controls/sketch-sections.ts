import {
    isFlag,
    isGroup,
    isNumericField,
    numberOf as fieldOf,
    type ControlChange,
    type ControlsView,
    type Group,
    type KnobView,
    type NumericField,
} from '../../../model/sketch/controls.ts';
import { CYCLES, DRAW_MODES, isKnob } from '../../../model/sketch/params.ts';
import { FITS, LATTICES, LENSES, SPACES } from '../../../model/sketch/space.ts';
import {
    numberOf,
    section,
    textOf,
    type Driven,
    type Property,
    type PropertyChange,
    type Section,
} from '../../../shared/properties.ts';
import { ICONS } from '../../../shared/ui/icons.ts';

export type SceneInput = {
    readonly view: ControlsView;
    readonly knobs: readonly KnobView[];
    readonly driven: readonly string[];
    readonly live: ReadonlyMap<string, string>;
    readonly chains: ReadonlyMap<string, string>;
};

const DRIVES: Partial<Readonly<Record<NumericField, string>>> = {
    focus: 'focus',
    baseSize: 'size',
    depthScalar: 'depth',
    trails: 'trails',
};

export const VIEW = 'view';

const readout = (field: NumericField, value: number): string =>
    field === 'dimension' || field === 'baseSize' ? String(value) : value.toFixed(2);

const named = (values: readonly string[]) => values.map(value => ({ value, label: value }));

const drivenOf = (
    { driven, live, chains }: SceneInput,
    drive: string,
    field: string,
    label: string,
): Driven | undefined => {
    if (!driven.includes(drive)) {
        return undefined;
    }

    const chain = chains.get(drive);
    const value = live.get(field);

    return {
        why: drive,
        chain: chain === undefined ? '' : `${label} ← ${chain}`,
        text: value === undefined ? 'follows' : `follows · ${value}`,
    };
};

const range = (
    input: SceneInput,
    field: NumericField,
    label: string,
    hint: string,
    [min, max, step]: readonly [number, number, number],
): Property => {
    const value = fieldOf(input.view, field);
    const drive = DRIVES[field];
    const driven = drive === undefined ? undefined : drivenOf(input, drive, field, label);

    return {
        kind: 'range',
        id: field,
        label,
        hint,
        value,
        min,
        max,
        step,
        text: readout(field, value),
        ...(driven === undefined ? {} : { driven }),
    };
};

const reset = ({ view }: SceneInput, group: Group, what: string) => ({
    id: `reset.${group}`,
    label: `reset ${what}`,
    glyph: ICONS.reset,
    disabled: !view.changed[group],
});

const knobProperty = (input: SceneInput, { knob, label }: KnobView): Property[] => {
    if (!isKnob(knob)) {
        return [];
    }

    const value = input.view.knobs[knob];
    const driven = drivenOf(input, knob, knob, label);

    return [
        {
            kind: 'range',
            id: knob,
            label,
            value,
            min: 0,
            max: 1,
            step: 0.01,
            text: readout(knob, value),
            ...(driven === undefined ? {} : { driven }),
            aside: {
                id: `cycles.${knob}`,
                label: `${label} motion`,
                value: String(input.view.motion[knob]),
                options: CYCLES.map(count => ({
                    value: String(count),
                    label: count === 0 ? 'still' : `${count}× per loop`,
                })),
                hint: 'let it swing from 0 to its value and back, a whole number of times per loop',
            },
        },
    ];
};

export const parameterSections = (input: SceneInput): readonly Section[] =>
    input.knobs.length === 0
        ? []
        : [
              section(
                  'parameters',
                  null,
                  input.knobs.flatMap(knob => knobProperty(input, knob)),
                  false,
                  reset(input, 'parameters', 'parameters'),
              ),
          ];

export const sceneSections = (input: SceneInput): readonly Section[] => {
    const { view } = input;

    return [
        section(
            'sampling',
            'Sampling',
            [
                {
                    kind: 'choice',
                    id: 'lattice',
                    label: 'lattice',
                    value: view.lattice,
                    options: named(LATTICES),
                    hint: 'where the formula is evaluated',
                },
                range(
                    input,
                    'dimension',
                    'density',
                    'how many points: the lattice has twice this many on a side',
                    [1, 128, 1],
                ),
                range(
                    input,
                    'focus',
                    'focus',
                    'bunch the points toward the middle (above 1) or the edges (below 1)',
                    [0.3, 3, 0.05],
                ),
            ],
            true,
            reset(input, 'sampling', 'sampling'),
        ),
        section(
            'drawing',
            'Drawing',
            [
                {
                    kind: 'choice',
                    id: 'mode',
                    label: 'mode',
                    value: view.mode,
                    options: named(DRAW_MODES),
                    hint: 'how each point is drawn',
                },
                ...(view.mode === 'dots'
                    ? [
                          range(
                              input,
                              'baseSize',
                              'dot size',
                              'the size of a dot at the camera target, in screen pixels',
                              [1, 20, 1],
                          ),
                          range(
                              input,
                              'depthScalar',
                              'depth',
                              'how much nearer dots grow and farther ones shrink',
                              [0.01, 2, 0.01],
                          ),
                      ]
                    : []),
                range(
                    input,
                    'trails',
                    'trails',
                    'fade each frame into the next instead of clearing it',
                    [0, 0.97, 0.01],
                ),
                {
                    kind: 'toggle',
                    id: 'axes',
                    label: 'axes',
                    value: view.axes,
                    hint: 'draw x, y and z and the -1 to 1 square',
                },
            ],
            true,
            reset(input, 'drawing', 'drawing'),
        ),
        section(
            'space',
            'Space',
            [
                {
                    kind: 'choice',
                    id: 'space',
                    label: 'space',
                    value: view.space,
                    options: named(SPACES),
                    hint: 'the coordinate system the formula output is read in',
                },
            ],
            true,
            reset(input, 'space', 'space'),
        ),
        section(
            'camera',
            'Camera',
            [
                {
                    kind: 'choice',
                    id: 'lens',
                    label: 'lens',
                    value: view.lens,
                    options: named(LENSES),
                    hint: 'perspective shrinks what is far away; orthographic keeps sizes',
                },
                {
                    kind: 'choice',
                    id: 'fit',
                    label: 'fit',
                    value: view.fit,
                    options: named(FITS),
                    hint: 'how the -1 to 1 square meets a canvas that is not square',
                },
                {
                    kind: 'action',
                    id: VIEW,
                    label: 'reset view',
                    glyph: ICONS.reset,
                    disabled: !view.turned,
                    hint: 'undo your own turning and zooming of the camera',
                },
            ],
            true,
            reset(input, 'camera', 'camera'),
        ),
    ];
};

export const controlChangeOf = (change: PropertyChange): ControlChange[] => {
    const { id } = change;
    const text = textOf(change);
    const value = numberOf(change);
    const group = id.startsWith('reset.') ? id.slice('reset.'.length) : '';
    const knob = id.startsWith('cycles.') ? id.slice('cycles.'.length) : '';

    if (isGroup(group)) {
        return [{ field: 'reset', group }];
    }

    if (isKnob(knob)) {
        const cycles = Number(text);
        return Number.isFinite(cycles) ? [{ field: 'cycles', knob, value: cycles }] : [];
    }

    if (isFlag(id)) {
        return typeof change.value === 'boolean' ? [{ field: id, value: change.value }] : [];
    }

    if (isNumericField(id)) {
        return value === null ? [] : [{ field: id, value }];
    }

    switch (id) {
        case 'mode':
        case 'fit':
        case 'lens':
        case 'lattice':
        case 'space':
            return text === null ? [] : [{ field: id, value: text }];
        default:
            return [];
    }
};
