import { describe, expect, it } from 'vitest';
import { streamsViewOf } from './streams-view.ts';

describe('the streams window', () => {
    const report = {
        at: 5000,
        windowMs: 3000,
        streams: [
            {
                name: 'clocks',
                total: 90,
                perSecond: 30,
                last: 'Map(1)',
                agoMs: 12,
                doubled: 0,
                firedAgoMs: [3000, 1500, 0],
            },
            {
                name: 'timers',
                total: 0,
                perSecond: 0,
                last: null,
                agoMs: null,
                doubled: 0,
                firedAgoMs: [],
            },
        ],
        doubles: [
            { at: 1000, stream: 'old', times: 2, with: [] },
            { at: 4800, stream: 'scenes', times: 2, with: ['documents'] },
        ],
        cascades: [],
        recent: [
            { at: 4000, fired: ['documents', 'scenes', 'scenes'] },
            { at: 4990, fired: ['clocks'] },
        ],
    };

    it('lays each stream on a lane, oldest left, now right', () => {
        const [clocks, timers] = streamsViewOf(report).lanes;

        expect(clocks?.dots).toEqual([0, 0.5, 1]);
        expect(clocks?.ago).toBe('12 ms');
        expect(timers?.ago).toBe('—');
        expect(timers?.last).toBe('');
    });

    it('warns of a stream that fired twice in a turn while it is still in view', () => {
        const view = streamsViewOf(report);

        expect(view.warning).toBe('scenes fired 2× in one turn, with documents');
        expect(streamsViewOf({ ...report, at: 9000 }).warning).toBeNull();
        expect(view.summary).toBe('1 of 2 firing · last 3 s');
        expect(
            streamsViewOf({
                ...report,
                doubles: [],
                streams: [
                    {
                        name: 'rewrites',
                        total: 1,
                        perSecond: 0.3,
                        last: '{window: "sketch-2"}',
                        agoMs: 200,
                        doubled: 0,
                        firedAgoMs: [200],
                    },
                ],
            }).warning,
        ).toBe('rendered twice: {window: "sketch-2"}');
    });

    it('lists the last turns newest first, counting repeats', () => {
        expect(streamsViewOf(report).turns.map(({ ago, fired }) => [ago, fired])).toEqual([
            ['10 ms', 'clocks'],
            ['1 s', 'documents · scenes ×2'],
        ]);
    });
});
