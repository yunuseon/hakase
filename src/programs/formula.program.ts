import { declarations } from '../declarations.ts';
import { combineLatest, concat, EMPTY, from, merge, of, timer } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    tap,
    withLatestFrom,
} from 'rxjs/operators';
import { FORMULA_GUIDE } from '../model/sketch/formulas/formula.ts';
import {
    isCustomId,
    isFormulaId,
    labelOf,
    nextId,
    optionsOf,
    summaryOf,
    type FormulaId,
} from '../library.ts';
import { seenBy, unseen, type Program } from '../program.ts';
import { type AppInput } from '../protocol.ts';
import { asFormulaEditor, defaultFormulaEditor } from '../settings.ts';
import { shareUrl } from '../share.ts';
import { formulaMenu } from '../components/formula-editor/formula-menu.ts';

const COPIED_MS = 1600;

export const formulaProgram = {
    ...declarations.formula,
    size: { width: 340, height: 480 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const [{ HksFormulaEditor }, { HksMenu }] = await Promise.all([
            import('../components/formula-editor/formula-editor.component.ts'),
            import('../shared/ui/menu.component.ts'),
        ]);
        const editor = new HksFormulaEditor().guide(FORMULA_GUIDE);
        const menu = new HksMenu();

        return {
            element: editor,
            actions: menu,
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
                                seenBy(self.id, (a: string, b: string) => a === b),
                                unseen,
                            ),
                            mergeMap(({ write }) => (write === null ? [] : [write])),
                        ),
                    ),
                );

                const picks$ = menu.picks$.pipe(share());
                const copied$ = picks$.pipe(
                    filter(({ id }) => id === 'share'),
                    withLatestFrom(chosen$, text$, library$),
                    map(([, name, source, library]) =>
                        shareUrl({ label: labelOf(name, library), source }),
                    ),
                    tap(link => {
                        void navigator.clipboard?.writeText(link).catch(() => undefined);
                    }),
                    switchMap(() => concat(of(true), timer(COPIED_MS).pipe(map(() => false)))),
                    startWith(false),
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
                        })
                        .pipe(ignoreElements()),
                    menu
                        .connect$(
                            combineLatest([chosen$, copied$]).pipe(
                                map(([formula, copied]) =>
                                    formulaMenu({ deletable: isCustomId(formula), copied }),
                                ),
                            ),
                            'formula actions',
                        )
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
                    picks$.pipe(
                        mergeMap(({ id, text }) => (id === 'save' ? [text ?? ''] : [])),
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
                    picks$.pipe(
                        filter(({ id }) => id === 'delete'),
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
} satisfies Program;
