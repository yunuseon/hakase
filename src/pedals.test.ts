import { describe, expect, it } from 'vitest';
import {
    defaultPedal,
    parsePedal,
    parseStoredPedal,
    PEDAL_KINDS,
    PEDALS,
    reducePedal,
    sourceOf,
    valueOf,
} from './pedals.ts';

describe('pedals', () => {
    it('start every knob at its initial value and every input unplugged', () => {
        PEDAL_KINDS.forEach(kind => {
            const pedal = defaultPedal(kind);

            PEDALS[kind].knobs.forEach(({ name, initial }) => {
                expect(valueOf(pedal, name)).toBe(initial);
            });
            PEDALS[kind].inputs.forEach(input => {
                expect(sourceOf(pedal, input)).toBeNull();
            });
        });
    });

    it('clamp a value to its knob, round a stepped one, and ignore an unknown knob', () => {
        const kaleido = defaultPedal('kaleido');

        expect(
            valueOf(
                reducePedal(kaleido, { kind: 'value', name: 'segments', value: 40 }),
                'segments',
            ),
        ).toBe(12);
        expect(
            valueOf(
                reducePedal(kaleido, { kind: 'value', name: 'segments', value: 4.6 }),
                'segments',
            ),
        ).toBe(5);
        expect(reducePedal(kaleido, { kind: 'value', name: 'nonsense', value: 1 })).toBe(kaleido);
        expect(reducePedal(kaleido, { kind: 'value', name: 'rotate', value: Number.NaN })).toBe(
            kaleido,
        );
    });

    it('take only a choice the pedal offers, and a source only on its own params', () => {
        const mix = defaultPedal('mix');

        expect(reducePedal(mix, { kind: 'choice', choice: 'screen' }).choice).toBe('screen');
        expect(reducePedal(mix, { kind: 'choice', choice: 'nonsense' })).toBe(mix);
        expect(
            sourceOf(reducePedal(mix, { kind: 'source', param: 'b', source: 'store-3' }), 'b'),
        ).toBe('store-3');
        expect(reducePedal(mix, { kind: 'source', param: 'in', source: 'store-3' })).toBe(mix);
    });

    it('read a stored pedal field by field, and refuse one of no known kind', () => {
        const parsed = parsePedal('feedback', {
            values: { decay: 7, zoom: 'big', constructor: 1 },
            choice: 'whatever',
            sources: { in: 'sketch-2', decay: 4 },
        });

        expect(valueOf(parsed, 'decay')).toBe(0.99);
        expect(valueOf(parsed, 'zoom')).toBe(1.02);
        expect(sourceOf(parsed, 'in')).toBe('sketch-2');
        expect(sourceOf(parsed, 'decay')).toBeNull();
        expect(parseStoredPedal({ kind: 'blur' })).toEqual(defaultPedal('blur'));
        expect(parseStoredPedal({ kind: 'constructor' })).toBeNull();
    });
});
