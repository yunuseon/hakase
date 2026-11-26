import { describe, expect, it } from 'vitest';
import { replayed } from '../replay.ts';
import { recording } from './camera-once.ts';

describe('a launch and a capture', () => {
    it('moves the camera once per change of the workspace', async () => {
        const { log } = await replayed(recording);

        expect(log.doubles.map(({ stream }) => stream)).toEqual([]);
    });
});
