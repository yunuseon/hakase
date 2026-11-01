export type Note = {
    readonly id: string;
    readonly text: string;
};

export type Notes = {
    readonly items: readonly Note[];
    readonly made: number;
};

export type NoteCommand =
    // The id is chosen by the program, so the window can select a note that did not exist a moment ago.
    | { readonly kind: 'create'; readonly id: string }
    | { readonly kind: 'edit'; readonly id: string; readonly text: string }
    | { readonly kind: 'remove'; readonly id: string };

export const emptyNotes: Notes = { items: [], made: 0 };

const numberOf = (id: string): number => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

export const nextNoteId = ({ made }: Notes): string => `note-${made + 1}`;

export const reduceNotes = (notes: Notes, command: NoteCommand): Notes => {
    switch (command.kind) {
        case 'create':
            return notes.items.some(({ id }) => id === command.id)
                ? notes
                : {
                      made: Math.max(notes.made, numberOf(command.id)),
                      items: [...notes.items, { id: command.id, text: '' }],
                  };
        case 'edit':
            return {
                ...notes,
                items: notes.items.map(note =>
                    note.id === command.id ? { ...note, text: command.text } : note,
                ),
            };
        case 'remove':
            return { ...notes, items: notes.items.filter(({ id }) => id !== command.id) };
    }
};

export const UNTITLED = 'Untitled';

export const titleOf = (text: string): string => {
    const line = text
        .split('\n')
        .map(part => part.replace(/^#+\s*/, '').trim())
        .find(part => part !== '');

    return line === undefined ? UNTITLED : line.length > 40 ? `${line.slice(0, 39)}…` : line;
};

export const shownNote = (notes: Notes, chosen: string | null): Note | null =>
    notes.items.find(({ id }) => id === chosen) ?? notes.items[0] ?? null;

export type Count = {
    readonly words: number;
    readonly characters: number;
};

export const countOf = (text: string): Count => ({
    words: text.split(/\s+/).filter(word => word !== '').length,
    characters: text.length,
});

const noteFrom = (value: unknown): Note | null => {
    if (typeof value !== 'object' || value === null || !('id' in value && 'text' in value)) {
        return null;
    }

    const { id, text } = value;

    return typeof id === 'string' && typeof text === 'string' ? { id, text } : null;
};

export const parseNotes = (value: unknown): Notes => {
    if (typeof value !== 'object' || value === null || !('items' in value && 'made' in value)) {
        return emptyNotes;
    }

    const { items, made } = value;

    if (!Array.isArray(items) || typeof made !== 'number' || !Number.isInteger(made)) {
        return emptyNotes;
    }

    const kept = items.map(noteFrom).filter(note => note !== null);

    return { items: kept, made: Math.max(made, 0, ...kept.map(({ id }) => numberOf(id))) };
};
