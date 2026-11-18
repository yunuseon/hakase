import { declarations } from '../declarations.ts';
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
import type { Theme } from '../model/sketch/theme.ts';
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
    minimum: { width: 240, height: 200 },
    launch: async () => {
        const { HksThemeEditor } =
            await import('../components/theme-editor/theme-editor.component.ts');
        const editor = new HksThemeEditor().presets(options);

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

                return merge(
                    editor
                        .connect$(chosen$, rows$, merge(rows$, editor.changes$))
                        .pipe(ignoreElements()),
                    editor.selections$.pipe(
                        mergeMap(name => (isThemeName(name) ? of(name) : EMPTY)),
                        map((theme): AppInput => ({
                            kind: 'settings',
                            settings: { kind: 'theme', theme },
                        })),
                    ),
                    editor.changes$.pipe(
                        withLatestFrom(chosen$),
                        map(([value, theme]): AppInput => ({ kind: 'theme', theme, value })),
                    ),
                );
            },
        };
    },
} satisfies Program;
