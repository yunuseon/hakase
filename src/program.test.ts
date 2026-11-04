import { describe, expect, it } from 'vitest';
import { seenBy, unseen, type Seen, type Written } from './program.ts';

const shown = (self: string, writes: readonly Written<string>[]) =>
    writes.reduce<{ seen: Seen<string>; out: readonly string[] }>(
        ({ seen, out }, written, index) => {
            const next = seenBy(self, (a: string, b: string) => a === b)(seen, written, index);

            return { seen: next, out: next.write === null ? out : [...out, next.write] };
        },
        { seen: unseen, out: [] },
    ).out;

describe('seenBy', () => {
    it('shows the first value and everyone else’s edits, never its own echo', () => {
        expect(
            shown('editor-1', [
                { value: 'a', from: null },
                { value: 'ab', from: 'editor-1' },
                { value: 'abc', from: 'editor-2' },
            ]),
        ).toEqual(['a', 'abc']);
    });

    it('shows an undo back to the value it last wrote, since the editor had moved on', () => {
        expect(
            shown('editor-1', [
                { value: 'base', from: null },
                { value: 'typed', from: 'editor-1' },
                { value: 'base', from: null },
            ]),
        ).toEqual(['base', 'base']);
    });

    it('writes nothing for a value it already holds', () => {
        expect(
            shown('editor-1', [
                { value: 'a', from: null },
                { value: 'a', from: 'editor-2' },
            ]),
        ).toEqual(['a']);
    });
});
