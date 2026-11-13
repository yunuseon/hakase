import { describe, expect, it } from 'vitest';
import { inputsFor as fixture } from './inputs.fixture.ts';
import { PROGRAM_IDS } from './program.ts';
import { inputsFor } from './programs.ts';

describe('the inputs fixture', () => {
    it('declares exactly what each real program declares, so tests read the inputs the app has', () => {
        const differ = PROGRAM_IDS.filter(
            program => JSON.stringify(fixture(program)) !== JSON.stringify(inputsFor(program)),
        );

        expect(differ).toEqual([]);
    });
});
