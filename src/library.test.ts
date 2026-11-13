import { describe, expect, it } from 'vitest';
import {
    emptyLibrary,
    nextId,
    parseLibrary,
    parseShare,
    reduceLibrary,
    shareHash,
    type LibraryCommand,
} from './library.ts';

const run = (commands: readonly LibraryCommand[]) => commands.reduce(reduceLibrary, emptyLibrary);

describe('the formula library', () => {
    it('adds formulas under fresh ids, and never hands an id out twice', () => {
        const library = run([
            { kind: 'add', id: 'custom-1', label: ' Ripples ', source: 'a' },
            { kind: 'add', id: 'custom-2', label: '', source: 'b' },
            { kind: 'remove', id: 'custom-2' },
        ]);

        expect(library.items.map(({ label }) => label)).toEqual(['Ripples']);
        expect(nextId(library)).toBe('custom-3');
        expect(
            reduceLibrary(library, { kind: 'add', id: 'custom-1', label: 'x', source: 'c' }),
        ).toBe(library);
    });

    it('imports a shared formula once, however often its link is opened', () => {
        const shared = { kind: 'import', label: 'Spiral', source: 'vec3 formula' } as const;
        const once = run([shared]);

        expect(once.items).toHaveLength(1);
        expect(reduceLibrary(once, shared)).toBe(once);
    });

    it('reads back what it saved, keeping its counter above every saved id', () => {
        expect(
            parseLibrary({ made: 0, items: [{ id: 'custom-7', label: 'L', source: 's' }] }),
        ).toEqual({
            made: 7,
            items: [{ id: 'custom-7', label: 'L', source: 's' }],
        });
        expect(parseLibrary({ made: 'x', items: [] })).toBe(emptyLibrary);
    });

    it('shares a formula as a link it can read back, and refuses anything else', () => {
        const shared = { label: 'Ümlaut ☼', source: 'vec3 formula(float x) { return vec3(x); }' };

        expect(parseShare(shareHash(shared))).toEqual(shared);
        expect(parseShare('#formula=not-base64!')).toBeNull();
        expect(parseShare('#other=abc')).toBeNull();
    });
});
