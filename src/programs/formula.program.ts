import { EMPTY, merge, of } from 'rxjs';
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
import { formulas, isFormulaName } from '../components/sketch/formulas/registry.ts';
import type { AppInput, Program } from '../program.ts';

const options = Object.entries(formulas).map(([value, { label }]) => ({ value, label }));

export const formulaProgram: Program = {
    id: 'formula',
    title: 'formula',
    kind: 'floating',
    icon: 'M9.5 8 L5.5 12 L9.5 16 M14.5 8 L18.5 12 L14.5 16',
    size: { width: 320, height: 420 },
    launch: () => {
        const editor = new HksFormulaEditor().presets(options);

        return {
            element: editor,
            run$: ({ source$, error$ }, self) => {
                const chosen$ = editor.selections$.pipe(
                    mergeMap(name => (isFormulaName(name) ? of(name) : EMPTY)),
                    distinctUntilChanged(),
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

                return merge(
                    editor
                        .connect$(shown$, chosen$.pipe(switchMap(name => error$(name))))
                        .pipe(ignoreElements()),
                    editor.changes$.pipe(
                        withLatestFrom(chosen$),
                        map(([text, formula]): AppInput => ({ kind: 'source', formula, text })),
                    ),
                );
            },
        };
    },
};
