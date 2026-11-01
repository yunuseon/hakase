import { asyncScheduler, combineLatest, merge, of } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    shareReplay,
    switchMap,
    throttleTime,
    withLatestFrom,
} from 'rxjs/operators';
import { HksInspector } from '../components/inspector/inspector.component.ts';
import { displayable, rowsOf, toggled } from '../components/inspector/inspector.ts';
import type { AppInput, Program } from '../program.ts';
import { asInspector, type InspectorSettings } from '../settings.ts';

const READ_MS = 250;

const write = (settings: InspectorSettings): AppInput => ({ kind: 'settings', settings });

export const inspectorProgram: Program = {
    id: 'inspector',
    title: 'inspector',
    category: 'system',
    icon: 'M8.5 4 C5.5 4 6.5 10 4 12 C6.5 14 5.5 20 8.5 20 M15.5 4 C18.5 4 17.5 10 20 12 C17.5 14 18.5 20 15.5 20',
    size: { width: 560, height: 420 },
    minimum: { width: 360, height: 220 },
    launch: () => {
        const inspector = new HksInspector();

        return {
            element: inspector,
            run$: ({ catalog$, inspect$ }, self) => {
                const settings$ = self.settings$.pipe(
                    map(asInspector),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const selected$ = settings$.pipe(
                    map(({ selected }) => selected),
                    distinctUntilChanged(),
                );
                const value$ = selected$.pipe(
                    switchMap(id => (id === null ? of(null) : inspect$(id))),
                    distinctUntilChanged(),
                    throttleTime(READ_MS, asyncScheduler, { leading: true, trailing: true }),
                    map(displayable),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                return merge(
                    inspector
                        .connect$({
                            tree$: catalog$,
                            selected$,
                            heading$: combineLatest([catalog$, selected$]).pipe(
                                map(([groups, id]) => {
                                    const group = groups.find(({ items }) =>
                                        items.some(item => item.id === id),
                                    );
                                    const item = group?.items.find(
                                        candidate => candidate.id === id,
                                    );

                                    return group === undefined || item === undefined
                                        ? ''
                                        : `${group.title} › ${item.label}`;
                                }),
                            ),
                            rows$: combineLatest([value$, settings$]).pipe(
                                map(([value, { expanded }]) => rowsOf(value, new Set(expanded))),
                            ),
                            copied$: inspector.copies$.pipe(
                                withLatestFrom(value$),
                                map(([, value]) => JSON.stringify(value, null, 2)),
                            ),
                        })
                        .pipe(ignoreElements()),
                    inspector.selections$.pipe(
                        withLatestFrom(settings$),
                        map(([selected, settings]) =>
                            write(
                                settings.selected === selected
                                    ? settings
                                    : { ...settings, selected, expanded: [] },
                            ),
                        ),
                    ),
                    inspector.toggles$.pipe(
                        withLatestFrom(settings$),
                        map(([path, settings]) =>
                            write({ ...settings, expanded: toggled(settings.expanded, path) }),
                        ),
                    ),
                );
            },
        };
    },
};
