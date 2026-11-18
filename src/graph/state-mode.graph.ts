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
import { inputsFor } from '../declarations.ts';
import type { StateCommand } from '../shared/connections.ts';
import {
    defaultSession,
    modeOf,
    reduceSession,
    wiringOf,
    type ModeAction,
    type StateMode as Mode,
    disengaged,
    reduceEngaged,
    type EngageAction,
} from '../state-mode.ts';
import { reduceWhy, sameTraced, tracedOf, type WhyAction } from '../why.ts';
import type { Chrome } from './chrome.graph.ts';
import type { Projections } from './projections.graph.ts';

type Reads = Pick<Chrome, 'canvas' | 'navigator' | 'wiring'> &
    Pick<Projections, 'workspace$' | 'links$' | 'ids$' | 'wires$'> & {
        readonly signals$: Observable<ProcessSignal>;
    };

export const stateModeOf = ({
    canvas,
    navigator,
    wiring,
    workspace$,
    links$,
    ids$,
    wires$,
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

    const engaged$ = merge(
        signals$.pipe(
            mergeMap((signal): EngageAction[] =>
                signal.to === 'hover'
                    ? [{ kind: 'hover', id: signal.id, over: signal.over }]
                    : signal.to === 'workspace' && signal.action.kind === 'raise'
                      ? [{ kind: 'press', id: signal.action.id }]
                      : [],
            ),
        ),
        canvas.grounds$.pipe(map((): EngageAction => ({ kind: 'press', id: null }))),
        ids$.pipe(map((ids): EngageAction => ({ kind: 'windows', ids }))),
    ).pipe(scan(reduceEngaged, disengaged), startWith(disengaged), distinctUntilChanged());

    const traced$ = combineLatest([
        workspace$,
        links$,
        merge(
            signals$.pipe(
                mergeMap((signal): WhyAction[] =>
                    signal.to === 'app' && signal.input.kind === 'why'
                        ? [
                              {
                                  kind: 'why',
                                  why: {
                                      window: signal.from,
                                      store: signal.store,
                                      input: signal.input.input,
                                  },
                              },
                          ]
                        : [],
                ),
            ),
            merge(canvas.escapes$, canvas.grounds$).pipe(map((): WhyAction => ({ kind: 'clear' }))),
        ).pipe(scan(reduceWhy, null), startWith(null), distinctUntilChanged()),
    ]).pipe(
        map(([{ processes }, { linked }, why]) => tracedOf(processes, linked, why)),
        distinctUntilChanged(sameTraced),
        shareReplay({ bufferSize: 1, refCount: true }),
    );

    const wiringView$: Observable<WiringView | null> = combineLatest([
        workspace$,
        links$,
        session$,
        remScale$,
        coarsePointer$,
        wires$,
        engaged$,
        traced$,
    ]).pipe(
        map(
            ([
                workspace,
                { linked, loops, boxes, names },
                session,
                unit,
                touch,
                style,
                engaged,
                traced,
            ]) =>
                wiringOf(
                    workspace,
                    linked,
                    inputsFor,
                    session,
                    unit,
                    touch,
                    loops,
                    boxes,
                    names,
                    style,
                    engaged,
                    traced,
                ),
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

    return { mode$, traced$, wiringView$, wiringEvents$, wiringCommands$ };
};

export type StateMode = ReturnType<typeof stateModeOf>;
