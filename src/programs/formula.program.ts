import { combineLatest, EMPTY, from, merge, of } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    scan,
    shareReplay,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import { HksFormulaEditor } from '../components/formula-editor/formula-editor.component.ts';
import { FORMULA_GUIDE } from '../components/sketch/formulas/formula.ts';
import {
    isCustomId,
    isFormulaId,
    labelOf,
    nextId,
    optionsOf,
    summaryOf,
    type FormulaId,
} from '../library.ts';
import type { AppInput, Program } from '../program.ts';
import { asFormulaEditor, defaultFormulaEditor } from '../settings.ts';
import { shareUrl } from '../share.ts';

export const formulaProgram: Program = {
    id: 'formula',
    title: 'formula',
    kind: 'floating',
    icon: 'M9.5 8 L5.5 12 L9.5 16 M14.5 8 L18.5 12 L14.5 16',
    size: { width: 340, height: 480 },
    minimum: { width: 260, height: 260 },
    launch: () => {
        const editor = new HksFormulaEditor().guide(FORMULA_GUIDE);

        return {
            element: editor,
            run$: ({ source$, error$, library$ }, self) => {
                const chosen$ = self.settings$.pipe(
                    map(settings => asFormulaEditor(settings).formula),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const text$ = chosen$.pipe(
                    switchMap(name => source$(name)),
                    map(({ value }) => value),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                // Ours would arrive debounced and overwrite what is being typed.
                const shown$ = chosen$.pipe(
                    switchMap(name =>
                        source$(name).pipe(
                            scan(
                                (shown, source, index) =>
                                    index === 0 || source.from !== self.id ? source.value : shown,
                                '',
                            ),
                            distinctUntilChanged(),
                        ),
                    ),
                );

                const choose = (formula: FormulaId): AppInput => ({
                    kind: 'settings',
                    settings: { kind: 'formula', formula },
                });

                return merge(
                    editor
                        .connect$({
                            options$: library$.pipe(map(optionsOf)),
                            selected$: chosen$,
                            preset$: shown$,
                            about$: combineLatest([chosen$, library$]).pipe(
                                map(([name, library]) => summaryOf(name, library)),
                            ),
                            error$: chosen$.pipe(switchMap(name => error$(name))),
                            deletable$: chosen$.pipe(map(isCustomId)),
                            copied$: editor.shares$.pipe(
                                withLatestFrom(chosen$, text$, library$),
                                map(([, name, source, library]) =>
                                    shareUrl({ label: labelOf(name, library), source }),
                                ),
                            ),
                        })
                        .pipe(ignoreElements()),
                    editor.selections$.pipe(
                        mergeMap(name => (isFormulaId(name) ? of(name) : EMPTY)),
                        map(choose),
                    ),
                    editor.changes$.pipe(
                        withLatestFrom(chosen$),
                        map(([text, formula]): AppInput => ({ kind: 'source', formula, text })),
                    ),
                    // Two inputs, in order: the copy must exist before this editor turns to it.
                    editor.saves$.pipe(
                        withLatestFrom(text$, library$),
                        mergeMap(([label, source, library]) => {
                            const id = nextId(library);
                            const inputs: readonly AppInput[] = [
                                { kind: 'library', command: { kind: 'add', id, label, source } },
                                choose(id),
                            ];

                            return from(inputs);
                        }),
                    ),
                    editor.deletes$.pipe(
                        withLatestFrom(chosen$),
                        mergeMap(([, id]) => {
                            if (!isCustomId(id)) {
                                return EMPTY;
                            }

                            const inputs: readonly AppInput[] = [
                                { kind: 'library', command: { kind: 'remove', id } },
                                choose(defaultFormulaEditor.formula),
                            ];

                            return from(inputs);
                        }),
                    ),
                );
            },
        };
    },
};
