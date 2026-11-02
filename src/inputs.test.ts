import { describe, expect, expectTypeOf, it } from 'vitest';
import {
    accepts,
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
        expect(initialFollows({ playback: playbackInput })).toEqual([
            { kind: 'playback', store: 'timeline' },
        ]);
        expect(initialFollows({ progress: progressInput })).toEqual([
            { kind: 'playback', store: 'timeline' },
        ]);
        expect(initialFollows({ playback: ownPlaybackInput })).toEqual([]);
        expect(initialFollows({})).toEqual([]);
    });

    it('accept only the kinds they declare', () => {
        expect(accepts({ progress: progressInput }, 'focus')).toBe(true);
        expect(accepts({ playback: playbackInput }, 'focus')).toBe(false);
        expect(accepts({ playback: ownPlaybackInput }, 'playback')).toBe(false);
        expect(accepts({}, 'playback')).toBe(false);
    });
});

describe('playbackBinding', () => {
    it('writes to a clock only, never to a focus timer', () => {
        expectTypeOf<FocusBinding>().not.toExtend<PlaybackBinding>();
        expect(
            playbackBinding({ progress: progressInput }, 'playhead', [
                { kind: 'focus', store: 'focus-a' },
            ]),
        ).toBeNull();
        expect(
            playbackBinding({ progress: progressInput }, 'playhead', [
                { kind: 'playback', store: 'movie' },
            ]),
        ).toEqual({
            kind: 'playback',
            store: 'movie',
        });
    });

    it('is a timeline’s own store', () => {
        expect(playbackBinding({ playback: ownPlaybackInput }, 'movie', [])).toEqual({
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
        expect(followedStores([{ kind: 'focus', store: 'focus-a' }])).toEqual(['focus-a']);
    });
});
