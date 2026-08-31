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
import type { Theme } from '../components/sketch/theme.ts';
import { isThemeName, themes } from '../components/sketch/themes/registry.ts';
import { HksThemeEditor } from '../components/theme-editor/theme-editor.component.ts';
import type { AppInput, Program } from '../program.ts';

const options = Object.keys(themes).map(value => ({ value, label: value }));

const sameShape = (a: Theme, b: Theme): boolean =>
    a.blend === b.blend && a.stops.length === b.stops.length;

export const themeProgram: Program = {
    id: 'theme',
    title: 'theme',
    kind: 'floating',
    icon: 'M4 6 H20 V18 H4 Z M10 6 V18 M15 6 V18',
    size: { width: 300, height: 260 },
    launch: () => {
        const editor = new HksThemeEditor().presets(options);

        return {
            element: editor,
            run$: ({ theme$ }, self) => {
                const chosen$ = editor.selections$.pipe(
                    mergeMap(name => (isThemeName(name) ? of(name) : EMPTY)),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                // Rebuild on a shape change only: not under a thumb the user is dragging.
                const rows$ = chosen$.pipe(
                    switchMap(name =>
                        theme$(name).pipe(
                            scan(
                                (shown: Theme, written, index) =>
                                    index === 0 ||
                                    written.from !== self.id ||
                                    !sameShape(shown, written.value)
                                        ? written.value
                                        : shown,
                                { stops: [], blend: 'smooth' },
                            ),
                            distinctUntilChanged(),
                        ),
                    ),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    editor.connect$(rows$, merge(rows$, editor.changes$)).pipe(ignoreElements()),
                    editor.changes$.pipe(
                        withLatestFrom(chosen$),
                        map(([value, theme]): AppInput => ({ kind: 'theme', theme, value })),
                    ),
                );
            },
        };
    },
};
