import { declarations } from '../declarations.ts';
import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import { appearanceFrom, sameAppearance, tokenValues, TOKENS } from '../appearance.ts';
import { appearances, isAppearanceName } from '../appearances.ts';
import { seenBy, unseen, type Program } from '../program.ts';
import { type AppInput } from '../protocol.ts';
import { isWireStyle, WIRE_STYLES } from '../shared/connections.ts';
import { appearanceSections, TOKEN } from '../components/appearance-editor/appearance-sections.ts';

const options = Object.keys(appearances).map(value => ({ value, label: value }));

export const appearanceProgram = {
    ...declarations.appearance,
    size: { width: 340, height: 300 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const [{ HksAppearanceEditor }, { HksProperties }] = await Promise.all([
            import('../components/appearance-editor/appearance-editor.component.ts'),
            import('../shared/ui/properties.component.ts'),
        ]);
        const editor = new HksAppearanceEditor().tokens(TOKENS);
        const properties = new HksProperties();
        editor.append(properties);

        return {
            element: editor,
            run$: ({ look$, appearance$, wires$ }, self) => {
                const current$ = look$.pipe(
                    switchMap(name => appearance$(name)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                // Our own edits are skipped, or a picker being dragged is rewritten under it.
                const shown$ = look$.pipe(
                    switchMap(name =>
                        appearance$(name).pipe(
                            scan(seenBy(self.id, sameAppearance), unseen),
                            mergeMap(({ write }) => (write === null ? [] : [write])),
                        ),
                    ),
                );
                const changes$ = properties.changes$.pipe(share());

                return merge(
                    editor.connect$(),
                    properties
                        .connect$(
                            combineLatest([look$, wires$, shown$.pipe(map(tokenValues))]).pipe(
                                map(([look, wires, values]) =>
                                    appearanceSections({
                                        look,
                                        looks: options,
                                        wires,
                                        styles: WIRE_STYLES,
                                        tokens: TOKENS,
                                        values,
                                    }),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    changes$.pipe(
                        mergeMap(({ id, value }): Observable<AppInput> => {
                            const text = typeof value === 'string' ? value : '';

                            return id === 'wires' && isWireStyle(text)
                                ? of({ kind: 'wires', wires: text })
                                : id === 'look' && isAppearanceName(text)
                                  ? of({ kind: 'look', name: text })
                                  : EMPTY;
                        }),
                    ),
                    changes$.pipe(
                        mergeMap(({ id, value }) =>
                            id.startsWith(TOKEN) && typeof value === 'string'
                                ? [{ token: id.slice(TOKEN.length), value }]
                                : [],
                        ),
                        withLatestFrom(look$, current$),
                        map(([{ token, value }, name, current]): AppInput => ({
                            kind: 'appearance',
                            name,
                            value: appearanceFrom(each =>
                                each === token ? value : current.value[each],
                            ),
                        })),
                    ),
                );
            },
        };
    },
} satisfies Program;
