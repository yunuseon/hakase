import { combineLatest, EMPTY, from, merge } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    shareReplay,
    take,
    withLatestFrom,
} from 'rxjs/operators';
import { HksNote } from '../components/note/note.component.ts';
import { countOf, nextNoteId, shownNote, titleOf, type Notes } from '../components/note/note.ts';
import type { AppInput, Program } from '../program.ts';
import { asNote } from '../settings.ts';

const choose = (note: string): AppInput => ({ kind: 'settings', settings: { kind: 'note', note } });

// Two inputs, in order: the note must exist before this window turns to it.
const created = (notes: Notes): readonly AppInput[] => {
    const id = nextNoteId(notes);

    return [{ kind: 'note', command: { kind: 'create', id } }, choose(id)];
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

export const noteProgram: Program = {
    id: 'note',
    title: 'note',
    category: 'plan',
    icon: 'M5 4 H19 V14 L14 20 H5 Z M14 20 V14 H19 M8.5 9 H15.5 M8.5 12.5 H12.5',
    size: { width: 300, height: 320 },
    minimum: { width: 200, height: 180 },
    launch: () => {
        const note = new HksNote();

        return {
            element: note,
            run$: ({ notes$ }, self) => {
                const shown$ = combineLatest([
                    notes$,
                    self.settings$.pipe(map(settings => asNote(settings).note)),
                ]).pipe(
                    map(([notes, chosen]) => shownNote(notes, chosen)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const id$ = shown$.pipe(
                    map(shown => shown?.id ?? null),
                    distinctUntilChanged(),
                );
                const text$ = shown$.pipe(map(shown => shown?.text ?? ''));

                return merge(
                    note
                        .connect$({
                            options$: notes$.pipe(
                                map(({ items }) =>
                                    items.map(({ id, text }) => ({
                                        value: id,
                                        label: titleOf(text),
                                    })),
                                ),
                            ),
                            selected$: id$,
                            text$,
                            count$: text$.pipe(
                                map(countOf),
                                map(
                                    ({ words, characters }) =>
                                        `${plural(words, 'word')} · ${plural(characters, 'character')}`,
                                ),
                            ),
                        })
                        .pipe(ignoreElements()),
                    // A window that never chose a note is a new one, and it opens on a blank page.
                    self.settings$.pipe(
                        take(1),
                        withLatestFrom(notes$),
                        mergeMap(([settings, notes]) =>
                            settings === undefined ? from(created(notes)) : EMPTY,
                        ),
                    ),
                    note.creates$.pipe(
                        withLatestFrom(notes$),
                        mergeMap(([, notes]) => from(created(notes))),
                    ),
                    note.selections$.pipe(map(choose)),
                    note.edits$.pipe(
                        withLatestFrom(id$),
                        mergeMap(([text, id]): AppInput[] =>
                            id === null
                                ? []
                                : [{ kind: 'note', command: { kind: 'edit', id, text } }],
                        ),
                    ),
                    note.removes$.pipe(
                        withLatestFrom(id$),
                        mergeMap(([, id]): AppInput[] =>
                            id === null ? [] : [{ kind: 'note', command: { kind: 'remove', id } }],
                        ),
                    ),
                );
            },
        };
    },
};
