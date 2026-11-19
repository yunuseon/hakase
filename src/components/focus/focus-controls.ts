import { isFocusPhase, PHASES, type FocusCommand, type FocusView } from '../../model/focus.ts';
import { numberOf, section, type PropertyChange, type Section } from '../../shared/properties.ts';

const TITLES = { work: 'focus', short: 'short break', long: 'long break' } as const;

export const focusSections = (lengths: FocusView['lengths']): readonly Section[] => [
    section(
        'lengths',
        'Lengths',
        PHASES.map(phase => ({
            kind: 'number' as const,
            id: `length.${phase}`,
            label: TITLES[phase],
            value: lengths[phase],
            step: 1,
            unit: 'min',
        })),
    ),
];

export const focusCommandOf = (change: PropertyChange): FocusCommand[] => {
    const phase = change.id.startsWith('length.') ? change.id.slice('length.'.length) : '';
    const minutes = numberOf(change);

    return isFocusPhase(phase) && minutes !== null ? [{ kind: 'length', phase, minutes }] : [];
};
