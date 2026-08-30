import { map } from 'rxjs/operators';
import { HksFormulaEditor } from '../components/formula-editor/formula-editor.component.ts';
import type { Program } from '../program.ts';

export const editor = new HksFormulaEditor();

export const formulaProgram: Program = {
    id: 'formula',
    title: 'formula',
    kind: 'floating',
    content: editor,
    connect$: ({ preset$, compiled$ }) =>
        editor.connect$(
            preset$,
            compiled$.pipe(map(result => (result.ok ? null : result.message))),
        ),
};
