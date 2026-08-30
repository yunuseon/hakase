import { EMPTY, merge, of } from 'rxjs';
import { ignoreElements, map, mergeMap, shareReplay } from 'rxjs/operators';
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
            run$: ({ error$ }) => {
                // Replayed: two readers, and the first selection arrives synchronously.
                const preset$ = editor.selections$.pipe(
                    mergeMap(name => (isFormulaName(name) ? of(formulas[name].source) : EMPTY)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    editor.connect$(preset$, error$).pipe(ignoreElements()),
                    merge(preset$, editor.changes$).pipe(
                        map((text): AppInput => ({ kind: 'source', text })),
                    ),
                );
            },
        };
    },
};
