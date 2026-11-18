import { describe, expect, it } from 'vitest';
import { between } from './stroke.ts';

describe('a drum stroke', () => {
    it('fills the cells a quick stroke skipped, along the line it was drawn', () => {
        expect(between({ drum: 'hat', step: 0 }, { drum: 'hat', step: 3 })).toEqual([
            { drum: 'hat', step: 1 },
            { drum: 'hat', step: 2 },
            { drum: 'hat', step: 3 },
        ]);
        expect(between({ drum: 'kick', step: 0 }, { drum: 'clap', step: 2 })).toEqual([
            { drum: 'snare', step: 1 },
            { drum: 'clap', step: 2 },
        ]);
        expect(between({ drum: 'tom', step: 5 }, { drum: 'tom', step: 5 })).toEqual([]);
    });
});
