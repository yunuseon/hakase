import { combineLatest, merge } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    shareReplay,
    withLatestFrom,
} from 'rxjs/operators';
import { HksAgenda } from '../components/agenda/agenda.component.ts';
import { laidOut, nextBlockId } from '../components/agenda/agenda.ts';
import { dayLabel, dayOf, minuteOfDay, shiftDay } from '../lib/day.ts';
import { wallClock$ } from '../lib/rx.ts';
import type { AppInput, Program } from '../program.ts';
import { asAgenda } from '../settings.ts';

const show = (day: string | null): AppInput => ({
    kind: 'settings',
    settings: { kind: 'agenda', day },
});

export const agendaProgram: Program = {
    id: 'agenda',
    title: 'agenda',
    icon: 'M4 6 H20 V20 H4 Z M4 10 H20 M8 3.5 V7.5 M16 3.5 V7.5 M7.5 13 H12.5 V17 H7.5 Z',
    size: { width: 320, height: 460 },
    minimum: { width: 220, height: 260 },
    launch: () => {
        const agenda = new HksAgenda();

        return {
            element: agenda,
            run$: ({ agenda$ }, self) => {
                const today$ = wallClock$.pipe(map(dayOf), distinctUntilChanged());
                const chosen$ = self.settings$.pipe(map(settings => asAgenda(settings).day));
                // null follows today, so a window left open overnight turns the page by itself.
                const day$ = combineLatest([chosen$, today$]).pipe(
                    map(([chosen, today]) => chosen ?? today),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const now$ = combineLatest([day$, today$, wallClock$]).pipe(
                    map(([day, today, ms]) => (day === today ? Math.floor(minuteOfDay(ms)) : null)),
                    distinctUntilChanged(),
                );

                return merge(
                    agenda
                        .connect$(
                            combineLatest([agenda$, day$, now$]).pipe(
                                map(([{ blocks }, day, now]) => ({
                                    label: dayLabel(day),
                                    blocks: laidOut(blocks.filter(block => block.day === day)),
                                    now,
                                })),
                            ),
                        )
                        .pipe(ignoreElements()),
                    agenda.steps$.pipe(
                        withLatestFrom(day$, today$),
                        map(([step, day, today]) => {
                            const next =
                                step === 'today' ? today : shiftDay(day, step === 'next' ? 1 : -1);

                            return show(next === today ? null : next);
                        }),
                    ),
                    agenda.changes$.pipe(
                        withLatestFrom(agenda$, day$),
                        map(([change, state, day]): AppInput => ({
                            kind: 'agenda',
                            command:
                                change.kind === 'create'
                                    ? {
                                          kind: 'add',
                                          id: nextBlockId(state),
                                          day,
                                          start: change.start,
                                          end: change.end,
                                      }
                                    : change,
                        })),
                    ),
                );
            },
        };
    },
};
