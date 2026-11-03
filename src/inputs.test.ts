import { describe, expect, expectTypeOf, it } from 'vitest';
import {
    accepts,
    fits,
    followedStores,
    initialFollows,
    ownPlaybackInput,
    playbackBinding,
    playbackInput,
    progressBinding,
    progressInput,
    type FocusBinding,
    type PlaybackBinding,
} from './inputs.ts';

describe('program inputs', () => {
    it('start a follower on the main clock, and an owner on nothing', () => {
        expect(initialFollows({ playback: playbackInput })).toEqual({
            playback: { kind: 'playback', store: 'timeline' },
        });
        expect(initialFollows({ progress: progressInput })).toEqual({
            progress: { kind: 'playback', store: 'timeline' },
        });
        expect(initialFollows({ playback: ownPlaybackInput })).toEqual({});
        expect(initialFollows({})).toEqual({});
    });

    it('accept only the kinds they declare', () => {
        expect(accepts({ progress: progressInput }, 'progress', 'focus')).toBe(true);
        expect(accepts({ progress: progressInput }, 'playback', 'playback')).toBe(false);
        expect(accepts({ playback: playbackInput }, 'playback', 'focus')).toBe(false);
        expect(accepts({ playback: ownPlaybackInput }, 'playback', 'playback')).toBe(false);
        expect(accepts({}, 'constructor', 'playback')).toBe(false);
    });

    it('fit only follows that bind every followed input and nothing else', () => {
        const timeline = { kind: 'playback', store: 'timeline' } as const;

        expect(fits({ playback: playbackInput }, { playback: timeline })).toBe(true);
        expect(fits({ playback: playbackInput }, {})).toBe(false);
        expect(fits({ playback: ownPlaybackInput }, {})).toBe(true);
        expect(fits({ playback: ownPlaybackInput }, { playback: timeline })).toBe(false);
        expect(fits({}, { progress: timeline })).toBe(false);
    });
});

describe('playbackBinding', () => {
    it('writes to a clock only, never to a focus timer', () => {
        expectTypeOf<FocusBinding>().not.toExtend<PlaybackBinding>();
        expect(
            playbackBinding({ progress: progressInput }, 'playhead', {
                progress: { kind: 'focus', store: 'focus-a' },
            }),
        ).toBeNull();
        expect(
            playbackBinding({ progress: progressInput }, 'playhead', {
                progress: { kind: 'playback', store: 'movie' },
            }),
        ).toEqual({
            kind: 'playback',
            store: 'movie',
        });
    });

    it('is a timeline’s own store', () => {
        expect(playbackBinding({ playback: ownPlaybackInput }, 'movie', {})).toEqual({
            kind: 'playback',
            store: 'movie',
        });
    });
});

describe('bindings', () => {
    it('are read only from kinds that exist', () => {
        expect(progressBinding('focus', 'focus-a')).toEqual({ kind: 'focus', store: 'focus-a' });
        expect(progressBinding('nope', 'x')).toBeNull();
    });

    it('count the store a window chose', () => {
        expect(followedStores({ progress: { kind: 'focus', store: 'focus-a' } })).toEqual([
            'focus-a',
        ]);
    });
});
