import { describe, expect, it } from 'vitest';
import { replayed } from '../replay.ts';
import { recording } from './launch-and-capture.ts';

describe('launching a note, capturing a to-do and launching a signal', () => {
    it('cascades through each new window, and no stream reaches a combine by two paths', async () => {
        const { log } = await replayed(recording);

        expect(log.doubles).toEqual([]);
        expect(log.cascades.map(({ stream }) => stream)).toEqual(['documents', 'documents']);
    });
});
