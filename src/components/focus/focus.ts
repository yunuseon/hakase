import { defer, EMPTY, interval, merge, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    map,
    pairwise,
    scan,
    shareReplay,
    startWith,
    switchMap,
    timestamp,
} from 'rxjs/operators';

export const PHASES = ['work', 'short', 'long'] as const;
export type FocusPhase = (typeof PHASES)[number];

export const isFocusPhase = (value: string): value is FocusPhase =>
    PHASES.some(phase => phase === value);

export type Lengths = Readonly<Record<FocusPhase, number>>;

export const ROUNDS = 4;
export const MAX_MINUTES = 180;
const MINUTE = 60_000;
const TICK_MS = 200;

export type Focus = {
    readonly phase: FocusPhase;
    readonly round: number;
    readonly remaining: number;
    readonly running: boolean;
    readonly lengths: Lengths;
    // Counts phases that ran out on their own, so a chime follows them and not a skip.
    readonly completed: number;
};

export type FocusCommand =
    | { readonly kind: 'toggle' }
    | { readonly kind: 'reset' }
    | { readonly kind: 'skip' }
    | { readonly kind: 'length'; readonly phase: FocusPhase; readonly minutes: number };

type FocusAction =
    | { readonly kind: 'command'; readonly command: FocusCommand }
    | { readonly kind: 'tick'; readonly ms: number };

export const defaultLengths: Lengths = { work: 25, short: 5, long: 15 };

const lengthOf = (lengths: Lengths, phase: FocusPhase): number => lengths[phase] * MINUTE;

export const initialFocus: Focus = {
    phase: 'work',
    round: 0,
    remaining: lengthOf(defaultLengths, 'work'),
    running: false,
    lengths: defaultLengths,
    completed: 0,
};

const advanced = (focus: Focus): Focus => {
    const round =
        focus.phase === 'work' ? focus.round + 1 : focus.phase === 'long' ? 0 : focus.round;
    const phase: FocusPhase = focus.phase !== 'work' ? 'work' : round >= ROUNDS ? 'long' : 'short';

    return { ...focus, phase, round, remaining: lengthOf(focus.lengths, phase), running: false };
};

export const clampMinutes = (minutes: number): number =>
    Math.min(Math.max(Math.round(minutes), 1), MAX_MINUTES);

export const reduceFocus = (focus: Focus, action: FocusAction): Focus => {
    if (action.kind === 'tick') {
        if (!focus.running) {
            return focus;
        }

        const remaining = focus.remaining - action.ms;

        return remaining > 0
            ? { ...focus, remaining }
            : { ...advanced(focus), completed: focus.completed + 1 };
    }

    const { command } = action;

    switch (command.kind) {
        case 'toggle':
            return { ...focus, running: !focus.running };
        case 'reset':
            return {
                ...initialFocus,
                lengths: focus.lengths,
                remaining: lengthOf(focus.lengths, 'work'),
                completed: focus.completed,
            };
        case 'skip':
            return advanced(focus);
        case 'length': {
            const lengths = { ...focus.lengths, [command.phase]: clampMinutes(command.minutes) };
            const untouched =
                command.phase === focus.phase &&
                !focus.running &&
                focus.remaining === lengthOf(focus.lengths, focus.phase);

            return {
                ...focus,
                lengths,
                remaining: untouched ? lengthOf(lengths, focus.phase) : focus.remaining,
            };
        }
    }
};

export const createFocus$ = (
    commands$: Observable<FocusCommand>,
    initial: Focus,
): Observable<Focus> => {
    const focus$: Observable<Focus> = merge(
        commands$.pipe(map((command): FocusAction => ({ kind: 'command', command }))),
        // defer: a phase that runs out pauses, so the ticks are gated by this fold.
        defer(() => focus$).pipe(
            map(({ running }) => running),
            distinctUntilChanged(),
            // An interval, not animation frames: those stop in a hidden tab, and a timer must not.
            switchMap(running =>
                running
                    ? interval(TICK_MS).pipe(
                          timestamp(),
                          startWith({ value: -1, timestamp: Date.now() }),
                          pairwise(),
                          map(([previous, now]) => now.timestamp - previous.timestamp),
                      )
                    : EMPTY,
            ),
            map((ms): FocusAction => ({ kind: 'tick', ms })),
        ),
    ).pipe(
        scan(reduceFocus, initial),
        startWith(initial),
        // Not refCount: closing the last timer window must not stop or reset the timer.
        shareReplay({ bufferSize: 1, refCount: false }),
    );

    return focus$;
};

export type FocusView = {
    readonly phase: FocusPhase;
    readonly label: string;
    readonly clock: string;
    readonly progress: number;
    readonly round: number;
    readonly running: boolean;
    readonly lengths: Lengths;
};

const LABELS: Readonly<Record<FocusPhase, string>> = {
    work: 'Focus',
    short: 'Short break',
    long: 'Long break',
};

export const clockOf = (ms: number): string => {
    const seconds = Math.max(Math.ceil(ms / 1000), 0);
    const minutes = Math.floor(seconds / 60);

    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export const focusView = (focus: Focus): FocusView => ({
    phase: focus.phase,
    label: LABELS[focus.phase],
    clock: clockOf(focus.remaining),
    progress: 1 - focus.remaining / lengthOf(focus.lengths, focus.phase),
    round: focus.round,
    running: focus.running,
    lengths: focus.lengths,
});

const minutesFrom = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clampMinutes(value) : fallback;

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

export const parseFocus = (value: unknown): Focus => {
    if (typeof value !== 'object' || value === null) {
        return initialFocus;
    }

    const stored = field(value, 'lengths');
    const lengths: Lengths =
        typeof stored === 'object' && stored !== null
            ? {
                  work: minutesFrom(field(stored, 'work'), defaultLengths.work),
                  short: minutesFrom(field(stored, 'short'), defaultLengths.short),
                  long: minutesFrom(field(stored, 'long'), defaultLengths.long),
              }
            : defaultLengths;
    const phase = field(value, 'phase');
    const kept: FocusPhase = typeof phase === 'string' && isFocusPhase(phase) ? phase : 'work';
    const round = field(value, 'round');
    const remaining = field(value, 'remaining');
    const full = lengthOf(lengths, kept);

    return {
        phase: kept,
        round:
            typeof round === 'number' && Number.isInteger(round)
                ? Math.min(Math.max(round, 0), ROUNDS)
                : 0,
        remaining:
            typeof remaining === 'number' && remaining > 0 ? Math.min(remaining, full) : full,
        running: false,
        lengths,
        completed: 0,
    };
};
