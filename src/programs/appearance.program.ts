import { EMPTY, merge, of, type Observable } from 'rxjs';
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
import {
    appearanceFrom,
    sameAppearance,
    tokenValues,
    TOKENS,
    type Appearance,
} from '../appearance.ts';
import { appearances, defaultLook, isAppearanceName } from '../appearances.ts';
import { HksAppearanceEditor } from '../components/appearance-editor/appearance-editor.component.ts';
import type { AppInput, Program } from '../program.ts';

const options = Object.keys(appearances).map(value => ({ value, label: value }));

export const appearanceProgram: Program = {
    id: 'appearance',
    title: 'appearance',
    icon: 'M12 4 a8 8 0 1 0 0 16 c1.2 0 1.6-.9 1.2-1.8 c-.5-1 .2-2.2 1.4-2.2 H17 a3 3 0 0 0 3-3 C20 7.4 16.4 4 12 4 Z M7.5 12 h.01 M9.5 8 h.01 M14.5 8 h.01',
    size: { width: 340, height: 300 },
    minimum: { width: 240, height: 220 },
    launch: () => {
        const editor = new HksAppearanceEditor().presets(options).tokens(TOKENS);

        return {
            element: editor,
            run$: ({ look$, appearance$ }, self) => {
                // Our own edits are skipped, or a picker being dragged is rewritten under it.
                const shown$ = look$.pipe(
                    switchMap(name =>
                        appearance$(name).pipe(
                            scan(
                                (shown: Appearance, written, index) =>
                                    index === 0 || written.from !== self.id ? written.value : shown,
                                appearances[defaultLook],
                            ),
                            distinctUntilChanged(sameAppearance),
                        ),
                    ),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    editor.connect$(look$, shown$.pipe(map(tokenValues))).pipe(ignoreElements()),
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
};
