import { describe, expect, it } from 'vitest';
import {
    choicesFor,
    nextChoiceIndex,
    matchedChoices,
    selectionLabel,
    type PickerView,
} from './search-picker.ts';

const options = [
    { value: 'a', label: '#12 Fix checkout', hint: 'In progress · bug · payments' },
    { value: 'b', label: '#20 Update docs', hint: 'To do · writing' },
];
const view: PickerView = {
    title: 'Parent ticket',
    options,
    selected: [],
    multiple: false,
    create: false,
};

describe('searchable choices', () => {
    it('searches every word across keys, titles and hints, ignoring case', () => {
        expect(matchedChoices(options, 'PAYMENTS checkout')).toEqual([options[0]]);
        expect(matchedChoices(options, '#20')).toEqual([options[1]]);
        expect(matchedChoices(options, 'missing')).toEqual([]);
        expect(matchedChoices(options, '')).toEqual(options);
    });
    it('only offers new choices when explicitly enabled, without duplicating existing names', () => {
        expect(choicesFor(view, 'work')).toEqual([]);
        expect(choicesFor({ ...view, create: true }, ' Work ')).toEqual([
            { value: 'work', label: 'Create “work”', hint: 'New tag' },
        ]);
        expect(
            choicesFor(
                { ...view, create: true, options: [{ value: 'work', label: 'work', hint: '' }] },
                'WORK',
            ),
        ).toHaveLength(1);
    });
    it('shows selected labels and an empty selection', () => {
        expect(selectionLabel(view)).toBe('None');
        expect(selectionLabel({ ...view, selected: ['a'] })).toBe('#12 Fix checkout');
    });
});

describe('choice keyboard navigation', () => {
    it('enters from search, wraps at either end, and tolerates no matches', () => {
        expect(nextChoiceIndex(-1, 3, 1)).toBe(0);
        expect(nextChoiceIndex(-1, 3, -1)).toBe(2);
        expect(nextChoiceIndex(2, 3, 1)).toBe(0);
        expect(nextChoiceIndex(0, 3, -1)).toBe(2);
        expect(nextChoiceIndex(-1, 0, 1)).toBe(-1);
    });
});
