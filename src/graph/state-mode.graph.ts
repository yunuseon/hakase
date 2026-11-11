import { combineLatest, defer, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    withLatestFrom,
} from 'rxjs/operators';
import {
    commandFor,
    sameWiring,
    type WiringCommand,
    type WiringView,
} from '../components/state-wiring/wiring.ts';
import { coarsePointer$, remScale$ } from '../lib/rx.ts';
import type { ProcessSignal } from '../process.ts';
import { inputsFor } from '../programs.ts';
import type { StateCommand } from '../shared/connections.ts';
import {
    defaultSession,
    modeOf,
    reduceSession,
    wiringOf,
    type ModeAction,
    type StateMode as Mode,
} from '../state-mode.ts';
import type { Chrome } from './chrome.graph.ts';
import type { Projections } from './projections.graph.ts';

type Reads = Pick<Chrome, 'canvas' | 'navigator' | 'wiring'> &
    Pick<Projections, 'workspace$' | 'linked$' | 'loops$' | 'ids$'> & {
        readonly signals$: Observable<ProcessSignal>;
    };

export const stateModeOf = ({
    canvas,
    navigator,
    wiring,
    workspace$,
    linked$,
    loops$,
    ids$,
    signals$,
}: Reads) => {
    const session$ = merge(
        signals$.pipe(
            mergeMap((signal): ModeAction[] =>
                signal.to === 'state-mode' ? [{ kind: 'enter' }] : [],
            ),
        ),
        signals$.pipe(
            mergeMap((signal): ModeAction[] =>
                signal.to === 'state-busy'
                    ? [{ kind: 'busy', key: `menu:${signal.id}`, busy: signal.busy }]
                    : [],
            ),
        ),
        ids$.pipe(map((ids): ModeAction => ({ kind: 'windows', ids }))),
        canvas.stateHolds$.pipe(map((held): ModeAction => ({ kind: 'hold', held }))),
        canvas.blurs$.pipe(map((): ModeAction => ({ kind: 'blur' }))),
        navigator.modes$.pipe(map((): ModeAction => ({ kind: 'toggle' }))),
        canvas.escapes$.pipe(map((): ModeAction => ({ kind: 'close' }))),
        defer(() => wiringEvents$).pipe(
            mergeMap((event): ModeAction[] =>
                event.kind === 'busy' ||
                event.kind === 'expand' ||
                event.kind === 'spring' ||
                event.kind === 'settle'
                    ? [event]
                    : [],
            ),
        ),
    ).pipe(
        scan(reduceSession, defaultSession),
        startWith(defaultSession),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const mode$: Observable<Mode> = session$.pipe(map(modeOf));

    const wiringView$: Observable<WiringView | null> = combineLatest([
        workspace$,
        linked$,
        loops$,
        session$,
        remScale$,
        coarsePointer$,
    ]).pipe(
        map(([workspace, signals, loops, session, unit, touch]) =>
            wiringOf(workspace, signals, inputsFor, session, unit, touch, loops),
        ),
        distinctUntilChanged(sameWiring),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
    const wiringEvents$: Observable<WiringCommand> = wiring.changes$.pipe(
        withLatestFrom(wiringView$),
        mergeMap(([event, view]) => {
            const command = commandFor(view, event);
            return command === null ? EMPTY : of(command);
        }),
        share(),
    );
    const wiringCommands$: Observable<StateCommand> = wiringEvents$.pipe(
        mergeMap(event => (event.kind === 'wire' ? of(event.command) : EMPTY)),
        share(),
    );

    return { mode$, wiringView$, wiringEvents$, wiringCommands$ };
};

export type StateMode = ReturnType<typeof stateModeOf>;
