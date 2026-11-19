import { declarations } from '../declarations.ts';
import { combineLatest, merge } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import type { Theme } from '../model/sketch/theme.ts';
import {
    editedTheme,
    themeSections,
    type ThemeEdit,
} from '../components/theme-editor/theme-edit.ts';
import { isThemeName, themes } from '../model/sketch/themes/registry.ts';
import { seenBy, unseen, type Program } from '../program.ts';
import { type AppInput } from '../protocol.ts';
import { asThemeEditor } from '../settings.ts';

const options = Object.keys(themes).map(value => ({ value, label: value }));

const sameShape = (a: Theme, b: Theme): boolean =>
    a.blend === b.blend && a.stops.length === b.stops.length;

export const themeProgram = {
    ...declarations.theme,
    size: { width: 300, height: 260 },
    minimum: { width: 220, height: 180 },
    launch: async () => {
        const [{ HksThemeEditor }, { HksProperties }] = await Promise.all([
            import('../components/theme-editor/theme-editor.component.ts'),
            import('../shared/ui/properties.component.ts'),
        ]);
        const editor = new HksThemeEditor();
        const properties = new HksProperties();
        editor.append(properties);

        return {
            element: editor,
            run$: ({ theme$ }, self) => {
                const chosen$ = self.settings$.pipe(
                    map(settings => asThemeEditor(settings).theme),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                // Rebuild on a shape change only: not under a thumb the user is dragging.
                const rows$ = chosen$.pipe(
                    switchMap(name =>
                        theme$(name).pipe(
                            scan(
                                seenBy(
                                    self.id,
                                    (a: Theme, b: Theme) => a === b,
                                    (had: Theme, next: Theme) => !sameShape(had, next),
                                ),
                                unseen,
                            ),
                            mergeMap(({ write }) => (write === null ? [] : [write])),
                        ),
                    ),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const current$ = chosen$.pipe(
                    switchMap(name => theme$(name)),
                    map(({ value }) => value),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const changes$ = properties.changes$.pipe(share());
                const edited$ = merge(
                    editor.edits$,
                    changes$.pipe(
                        mergeMap(({ id, value }): ThemeEdit[] =>
                            id === 'blend' && (value === 'smooth' || value === 'steps')
                                ? [{ kind: 'blend', blend: value }]
                                : [],
                        ),
                    ),
                ).pipe(
                    withLatestFrom(current$),
                    map(([edit, theme]) => editedTheme(theme, edit)),
                    share(),
                );

                return merge(
                    editor.connect$(rows$, merge(rows$, edited$)).pipe(ignoreElements()),
                    properties
                        .connect$(
                            combineLatest([
                                chosen$,
                                current$.pipe(
                                    map(({ blend }) => blend),
                                    distinctUntilChanged(),
                                ),
                            ]).pipe(
                                map(([theme, blend]) =>
                                    themeSections({ theme, themes: options, blend }),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    changes$.pipe(
                        mergeMap(({ id, value }) =>
                            id === 'theme' && typeof value === 'string' && isThemeName(value)
                                ? [value]
                                : [],
                        ),
                        map((theme): AppInput => ({
                            kind: 'settings',
                            settings: { kind: 'theme', theme },
                        })),
                    ),
                    edited$.pipe(
                        withLatestFrom(chosen$),
                        map(([value, theme]): AppInput => ({ kind: 'theme', theme, value })),
                    ),
                );
            },
        };
    },
} satisfies Program;
