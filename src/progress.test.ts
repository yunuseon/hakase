import { describe, expect, it } from 'vitest';
import { defer, firstValueFrom, of } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { focusProgress, progressScrubs$, type ProgressConnection } from './progress.ts';
import { initialFocus, reduceFocus } from './components/focus/focus.ts';

describe('progress projections', () => {
    it('reads the current focus phase without seeking or changing the timer', () => {
        const running = reduceFocus(initialFocus, { kind: 'command', command: { kind: 'toggle' } });
        const halfway = reduceFocus(running, { kind: 'tick', ms: running.remaining / 2 });

        expect(focusProgress(halfway)).toEqual({ access: 'read', at: 0.5 });
        expect(halfway.running).toBe(true);
        expect(
            focusProgress(reduceFocus(halfway, { kind: 'command', command: { kind: 'skip' } })),
        ).toEqual({ access: 'read', at: 0 });
    });

    it('never subscribes to gestures for a read-only binding', async () => {
        const gestures$ = defer(() => {
            throw new Error('Read-only progress subscribed to gestures');
        });
        const values = await firstValueFrom(
            progressScrubs$(of({ access: 'read', position$: of(0) }), gestures$).pipe(toArray()),
        );

        expect(values).toEqual([]);
    });

    it('keeps a gesture across ticks and cancels it on a read-only rebind', async () => {
        const { TestScheduler } = await import('rxjs/testing');
        const scheduler = new TestScheduler((actual, expected) => expect(actual).toEqual(expected));
        scheduler.run(({ hot, cold, expectObservable, expectSubscriptions }) => {
            const position$ = hot('a-b-c-d---|', { a: 0, b: 0.1, c: 0.2, d: 0.3 });
            const progress$ = hot<ProgressConnection>('a---b-c---|', {
                a: { access: 'scrub', position$ },
                b: { access: 'read', position$ },
                c: { access: 'scrub', position$ },
            });
            const gestures$ = cold('---g----', { g: { phase: 'grab' as const, at: 0.5 } });
            expectObservable(progressScrubs$(progress$, gestures$), '^---------!').toBe(
                '---g-----g',
                { g: { phase: 'grab', at: 0.5 } },
            );
            expectSubscriptions(gestures$.subscriptions).toBe(['^---!', '------^---!']);
        });
    });

    it('starts a new gesture subscription on playback-to-playback rebind', async () => {
        const { TestScheduler } = await import('rxjs/testing');
        const scheduler = new TestScheduler((actual, expected) => expect(actual).toEqual(expected));
        scheduler.run(({ hot, cold, expectObservable, expectSubscriptions }) => {
            const progress$ = hot<ProgressConnection>('a-b---|', {
                a: { access: 'scrub', position$: of(0) },
                b: { access: 'scrub', position$: of(0.5) },
            });
            const gestures$ = cold('---g|', { g: { phase: 'grab' as const, at: 0.5 } });
            expectObservable(progressScrubs$(progress$, gestures$)).toBe('-----g|', {
                g: { phase: 'grab', at: 0.5 },
            });
            expectSubscriptions(gestures$.subscriptions).toBe(['^-!', '--^---!']);
        });
    });
});
