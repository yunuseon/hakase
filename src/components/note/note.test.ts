import { describe, expect, it } from 'vitest';
import {
    countOf,
    emptyNotes,
    nextNoteId,
    parseNotes,
    reduceNotes,
    shownNote,
    titleOf,
    UNTITLED,
    type NoteCommand,
    type Notes,
} from './note.ts';

const run = (...commands: NoteCommand[]): Notes => commands.reduce(reduceNotes, emptyNotes);

describe('reduceNotes', () => {
    it('creates under the id it was given and advances the counter', () => {
        const notes = run({ kind: 'create', id: 'note-1' }, { kind: 'create', id: 'note-1' });

        expect(notes.items).toEqual([{ id: 'note-1', text: '' }]);
        expect(nextNoteId(notes)).toBe('note-2');
    });

    it('never hands out a removed id again', () => {
        const notes = run({ kind: 'create', id: 'note-1' }, { kind: 'remove', id: 'note-1' });

        expect(nextNoteId(notes)).toBe('note-2');
    });

    it('edits one note', () => {
        const notes = run(
            { kind: 'create', id: 'note-1' },
            { kind: 'create', id: 'note-2' },
            { kind: 'edit', id: 'note-2', text: 'hi' },
        );

        expect(notes.items.map(({ text }) => text)).toEqual(['', 'hi']);
    });
});

describe('titleOf', () => {
    it('takes the first line with text, without heading marks', () => {
        expect(titleOf('\n\n# Groceries\nmilk')).toBe('Groceries');
        expect(titleOf('  ')).toBe(UNTITLED);
        expect(titleOf('x'.repeat(60))).toHaveLength(40);
    });
});

describe('shownNote', () => {
    const notes = run({ kind: 'create', id: 'note-1' }, { kind: 'create', id: 'note-2' });

    it('shows the chosen note, or the first one when it is gone', () => {
        expect(shownNote(notes, 'note-2')?.id).toBe('note-2');
        expect(shownNote(notes, 'note-9')?.id).toBe('note-1');
        expect(shownNote(emptyNotes, null)).toBeNull();
    });
});

describe('countOf', () => {
    it('counts words across any whitespace', () => {
        expect(countOf('  one two\nthree ')).toEqual({ words: 3, characters: 16 });
    });
});

describe('parseNotes', () => {
    it('keeps the counter above every id it finds', () => {
        expect(parseNotes({ items: [{ id: 'note-7', text: '' }, 3], made: 1 })).toEqual({
            items: [{ id: 'note-7', text: '' }],
            made: 7,
        });
        expect(parseNotes('x')).toBe(emptyNotes);
    });
});
