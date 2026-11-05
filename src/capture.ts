import { emptyNotes, nextNoteId } from './components/note/note.ts';
import { CAPTURES, type Picked } from './commands.ts';
import type { DocumentAction, Documents } from './documents.ts';
import { withMain } from './stores.ts';

type Capture = Extract<Picked, { readonly kind: 'capture' }>;

export const capturedActions = (
    { target, store, text }: Capture,
    { notes, workspace }: Pick<Documents, 'notes' | 'workspace'>,
): readonly DocumentAction[] => {
    const program = CAPTURES.find(capture => capture.target === target)?.program;

    // The id came from a clicked row: a store of another program, or one since deleted, takes nothing.
    if (
        program === undefined ||
        !withMain(program, workspace.stores).some(({ id }) => id === store)
    ) {
        return [];
    }

    switch (target) {
        case 'ticket':
        case 'todo':
            return [
                {
                    kind: 'tickets',
                    store,
                    command: { kind: 'add', status: null, title: text, parent: null },
                },
            ];
        case 'note': {
            const id = nextNoteId(notes.get(store) ?? emptyNotes);

            return [{ kind: 'notes', store, command: { kind: 'create', id, text } }];
        }
    }
};
