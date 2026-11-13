import { describe, expect, it } from 'vitest';
import { inputsFor } from './inputs.fixture.ts';
import { madeBy } from './inputs.ts';
import { HOLDING } from './stores.ts';
import { PROGRAM_IDS } from './program.ts';
import { CONVERSIONS, converts } from './port-types.ts';

describe('typed ports', () => {
    it('let every input take only its own type or one that converts to it with nothing to choose', () => {
        const strays = PROGRAM_IDS.flatMap(program =>
            Object.entries(inputsFor(program)).flatMap(([name, definition]) =>
                definition.from === 'own'
                    ? []
                    : definition.sources
                          .filter(source => !converts(source.makes, definition.takes))
                          .map(source => `${program}.${name} takes ${source.kind}`),
            ),
        );

        expect(strays).toEqual([]);
    });

    it('list each implicit conversion once', () => {
        const keys = CONVERSIONS.map(({ from, to }) => `${from}>${to}`);

        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('outputs', () => {
    it('name a type for every program that keeps state, so no jack is left unmarked', () => {
        expect(
            PROGRAM_IDS.filter(program => HOLDING[program] !== null && madeBy(program) === null),
        ).toEqual([]);
    });
});
