import type { Tab } from '../animation.ts';
import { isCycles, isDrawMode, isKnob, type Knob, type Panel } from '../params.ts';
import { isFit, isLattice, isLens, isSpace } from '../space.ts';

export type ControlsView = Panel & {
    readonly formula: string;
    readonly theme: string;
    readonly tab: Tab;
    // Whether the viewer has moved the camera at all, which is all the reset button needs to know.
    readonly turned: boolean;
};

export const NUMERIC_FIELDS = [
    'dimension',
    'baseSize',
    'depthScalar',
    'focus',
    'trails',
    'k1',
    'k2',
    'k3',
    'k4',
] as const;

export type NumericField = (typeof NUMERIC_FIELDS)[number];

export const FLAGS = ['axes'] as const;

export type Flag = (typeof FLAGS)[number];

export const isFlag = (value: string): value is Flag => FLAGS.some(flag => flag === value);

export const isNumericField = (value: string): value is NumericField =>
    NUMERIC_FIELDS.some(field => field === value);

// Only what the user did, never a reading of the inputs: the fold owns the values, the inputs show them.
export type ControlChange =
    | {
          readonly field:
              'formula' | 'theme' | 'tab' | 'mode' | 'fit' | 'lens' | 'lattice' | 'space';
          readonly value: string;
      }
    | { readonly field: NumericField; readonly value: number }
    | { readonly field: Flag; readonly value: boolean }
    | { readonly field: 'cycles'; readonly knob: Knob; readonly value: number };

export const numberOf = (view: ControlsView, field: NumericField): number =>
    isKnob(field) ? view.knobs[field] : view[field];

export const withChange = (panel: Panel, change: ControlChange): Panel => {
    switch (change.field) {
        case 'formula':
        case 'theme':
        case 'tab':
            return panel;
        case 'mode':
            return isDrawMode(change.value) ? { ...panel, mode: change.value } : panel;
        case 'fit':
            return isFit(change.value) ? { ...panel, fit: change.value } : panel;
        case 'lens':
            return isLens(change.value) ? { ...panel, lens: change.value } : panel;
        case 'lattice':
            return isLattice(change.value) ? { ...panel, lattice: change.value } : panel;
        case 'space':
            return isSpace(change.value) ? { ...panel, space: change.value } : panel;
        case 'axes':
            return { ...panel, axes: change.value };
        case 'cycles':
            return isCycles(change.value)
                ? { ...panel, motion: { ...panel.motion, [change.knob]: change.value } }
                : panel;
        case 'dimension':
        case 'baseSize':
        case 'depthScalar':
        case 'focus':
        case 'trails':
            return { ...panel, [change.field]: change.value };
        case 'k1':
        case 'k2':
        case 'k3':
        case 'k4':
            return { ...panel, knobs: { ...panel.knobs, [change.field]: change.value } };
    }
};
