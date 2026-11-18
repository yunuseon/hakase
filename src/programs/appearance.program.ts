import { declarations } from '../declarations.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import {
    ignoreElements,
    map,
    mergeMap,
    scan,
    shareReplay,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import { appearanceFrom, sameAppearance, tokenValues, TOKENS } from '../appearance.ts';
import { appearances, isAppearanceName } from '../appearances.ts';
import { seenBy, unseen, type Program } from '../program.ts';
import { type AppInput } from '../protocol.ts';
import { isWireStyle } from '../shared/connections.ts';

const options = Object.keys(appearances).map(value => ({ value, label: value }));

export const appearanceProgram = {
    ...declarations.appearance,
    size: { width: 340, height: 300 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const { HksAppearanceEditor } =
            await import('../components/appearance-editor/appearance-editor.component.ts');
        const editor = new HksAppearanceEditor().presets(options).tokens(TOKENS);

        return {
            element: editor,
            run$: ({ look$, appearance$, wires$ }, self) => {
                // Our own edits are skipped, or a picker being dragged is rewritten under it.
                const shown$ = look$.pipe(
                    switchMap(name =>
                        appearance$(name).pipe(
                            scan(seenBy(self.id, sameAppearance), unseen),
                            mergeMap(({ write }) => (write === null ? [] : [write])),
                        ),
                    ),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    editor
                        .connect$(look$, shown$.pipe(map(tokenValues)), wires$)
                        .pipe(ignoreElements()),
                    editor.wires$.pipe(
                        mergeMap((wires): Observable<AppInput> =>
                            isWireStyle(wires) ? of({ kind: 'wires', wires }) : EMPTY,
                        ),
                    ),
                    editor.selections$.pipe(
                        mergeMap((name): Observable<AppInput> =>
                            isAppearanceName(name) ? of({ kind: 'look', name }) : EMPTY,
                        ),
                    ),
                    editor.changes$.pipe(
                        withLatestFrom(look$, shown$),
                        map(([values, name, shown]): AppInput => ({
                            kind: 'appearance',
                            name,
                            value: appearanceFrom(token => values.get(token) ?? shown[token]),
                        })),
                    ),
                );
            },
        };
    },
} satisfies Program;
