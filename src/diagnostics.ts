import { declarations } from './declarations.ts';
import type { Bindings } from './inputs.ts';
import { listed, type Workspace } from './workspace.ts';

const bindingsOf = (follows: Bindings): Bindings => follows;

export type Pulse = { readonly stream: string; readonly at: number; readonly digest: string };

export type Turn = { readonly at: number; readonly pulses: readonly Pulse[] };

export type Doubled = {
    readonly at: number;
    readonly stream: string;
    readonly times: number;
    readonly with: readonly string[];
};

export type Log = {
    readonly turns: readonly Turn[];
    readonly totals: ReadonlyMap<string, number>;
    readonly lasts: ReadonlyMap<string, Pulse>;
    readonly doubles: readonly Doubled[];
};

export const emptyLog: Log = { turns: [], totals: new Map(), lasts: new Map(), doubles: [] };

export const KEEP_MS = 3000;
const KEEP_DOUBLES = 50;
const DIGEST_CHARS = 160;
const TEXT_CHARS = 40;

const rounded = (value: number): string =>
    Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);

const entries = (value: object): readonly (readonly [string, unknown])[] =>
    Object.entries(value).filter(([, each]) => typeof each !== 'function');

export const digestOf = (value: unknown, depth = 3): string => {
    const line = (() => {
        if (value === null || value === undefined) {
            return String(value);
        }
        if (typeof value === 'number') {
            return rounded(value);
        }
        if (typeof value === 'boolean' || typeof value === 'bigint') {
            return String(value);
        }
        if (typeof value === 'string') {
            return JSON.stringify(
                value.length > TEXT_CHARS ? `${value.slice(0, TEXT_CHARS)}…` : value,
            );
        }
        if (typeof value === 'function' || typeof value === 'symbol') {
            return typeof value;
        }
        if (ArrayBuffer.isView(value)) {
            return `${value.constructor.name}(${value.byteLength} bytes)`;
        }
        if (value instanceof Map) {
            return depth <= 0
                ? `Map(${value.size})`
                : `Map(${value.size}){${[...value]
                      .slice(0, 3)
                      .map(([key, each]) => `${digestOf(key, 0)}: ${digestOf(each, depth - 1)}`)
                      .join(', ')}${value.size > 3 ? ', …' : ''}}`;
        }
        if (value instanceof Set) {
            return `Set(${value.size})`;
        }
        if (Array.isArray(value)) {
            return depth <= 0
                ? `[${value.length}]`
                : `[${value.length}: ${value
                      .slice(0, 3)
                      .map(each => digestOf(each, depth - 1))
                      .join(', ')}${value.length > 3 ? ', …' : ''}]`;
        }
        if (typeof value === 'object') {
            const fields = entries(value);
            const kind = fields.find(([key]) => key === 'kind')?.[1];
            const rest = fields.filter(([key]) => key !== 'kind');

            return `${typeof kind === 'string' ? kind : ''}{${
                depth <= 0
                    ? `${rest.length} fields`
                    : rest
                          .slice(0, 6)
                          .map(([key, each]) => `${key}: ${digestOf(each, depth - 1)}`)
                          .join(', ') + (rest.length > 6 ? ', …' : '')
            }}`;
        }

        return typeof value;
    })();

    return line.length > DIGEST_CHARS ? `${line.slice(0, DIGEST_CHARS)}…` : line;
};

const SPOKEN = ['inputs', 'actions', 'windows', 'rewrites', 'redraws'];
const EVENTS = [...SPOKEN, 'draws'];

export const doublesOf = ({ at, pulses }: Turn): readonly Doubled[] => {
    const counts = pulses.reduce(
        (seen, { stream }) => new Map(seen).set(stream, (seen.get(stream) ?? 0) + 1),
        new Map<string, number>(),
    );
    const streams = [...counts.keys()];

    return [...counts]
        .filter(([stream, times]) => times > 1 && !EVENTS.includes(stream))
        .map(([stream, times]) => ({
            at,
            stream,
            times,
            with: streams.filter(other => other !== stream),
        }));
};

export const recordTurn = (log: Log, turn: Turn): Log => ({
    turns: [...log.turns.filter(({ at }) => turn.at - at <= KEEP_MS), turn],
    totals: turn.pulses.reduce(
        (totals, { stream }) => new Map(totals).set(stream, (totals.get(stream) ?? 0) + 1),
        log.totals,
    ),
    lasts: turn.pulses.reduce((lasts, pulse) => new Map(lasts).set(pulse.stream, pulse), log.lasts),
    doubles: [...log.doubles, ...doublesOf(turn)].slice(-KEEP_DOUBLES),
});

export type StreamReport = {
    readonly name: string;
    readonly total: number;
    readonly perSecond: number;
    readonly last: string | null;
    readonly agoMs: number | null;
    readonly doubled: number;
    readonly firedAgoMs: readonly number[];
};

export type Report = {
    readonly at: number;
    readonly windowMs: number;
    readonly streams: readonly StreamReport[];
    readonly doubles: readonly Doubled[];
    readonly recent: readonly {
        readonly at: number;
        readonly fired: readonly string[];
    }[];
};

const RECENT_TURNS = 12;
const LANE_DOTS = 120;

export const reportOf = (log: Log, names: readonly string[], now: number): Report => {
    const pulses = log.turns.filter(({ at }) => now - at <= KEEP_MS).flatMap(turn => turn.pulses);

    return {
        at: Math.round(now),
        windowMs: KEEP_MS,
        streams: names.map(name => {
            const own = pulses.filter(({ stream }) => stream === name);
            const last = log.lasts.get(name);

            return {
                name,
                total: log.totals.get(name) ?? 0,
                perSecond: Math.round((own.length / KEEP_MS) * 1000 * 10) / 10,
                last: last?.digest ?? null,
                agoMs: last ? Math.round(now - last.at) : null,
                doubled: log.doubles.filter(({ stream }) => stream === name).length,
                firedAgoMs: own.slice(-LANE_DOTS).map(({ at }) => Math.round(now - at)),
            };
        }),
        doubles: log.doubles.slice(-10),
        recent: log.turns.slice(-RECENT_TURNS).map(({ at, pulses: fired }) => ({
            at: Math.round(at),
            fired: fired.map(({ stream }) => stream),
        })),
    };
};

type Logged<A> = { readonly seq: number; readonly action: A };
type Stepped<A> = { readonly label: string; readonly actions: readonly Logged<A>[] };

export type Newest = {
    readonly seq: number;
    readonly step: string | null;
    readonly action: unknown;
    readonly undone: number;
};

type Logbook<A> = { readonly steps: readonly Stepped<A>[]; readonly cursor: number };

// Read from the log, not from the action streams: those may be cold, and a second subscription would run them twice.
export const newestAction = <A>(
    { steps, cursor }: Logbook<A>,
    makesStep: (action: A) => boolean,
): Newest | null =>
    steps
        .slice(-2)
        .flatMap(({ label, actions }) =>
            actions.map(({ seq, action }) => ({
                seq,
                step: makesStep(action) ? label : null,
                action,
                undone: steps.length - cursor,
            })),
        )
        .reduce<Newest | null>(
            (newest, each) => (newest && newest.seq > each.seq ? newest : each),
            null,
        );

export const sameLogged = (a: Newest | null, b: Newest | null): boolean =>
    a?.seq === b?.seq && a?.undone === b?.undone;

const counted = (pulses: readonly Pulse[]): readonly (readonly [string, readonly Pulse[]])[] => [
    ...pulses.reduce(
        (seen, pulse) => seen.set(pulse.stream, [...(seen.get(pulse.stream) ?? []), pulse]),
        new Map<string, readonly Pulse[]>(),
    ),
];

export const lineOf = ({ at, pulses }: Turn): string => {
    const streams = counted(pulses);
    const said = streams
        .filter(([stream]) => SPOKEN.includes(stream))
        .map(
            ([stream, own]) =>
                `${stream === 'rewrites' ? '⚠ rendered twice' : stream === 'redraws' ? '⚠ drawn twice in a frame' : stream} ${own.map(({ digest }) => digest).join(' | ')}`,
        );
    const reached = streams
        .filter(([stream]) => !SPOKEN.includes(stream))
        .map(([stream, own]) => (own.length > 1 ? `${stream} ×${own.length}` : stream));
    const doubled = streams
        .filter(([stream, own]) => own.length > 1 && !EVENTS.includes(stream))
        .map(([stream]) => stream);

    return [
        `hakase ${Math.round(at)}ms`,
        ...said,
        reached.length > 0 ? `→ ${reached.join(', ')}` : '',
        doubled.length > 0 ? `⚠ fired twice in one turn: ${doubled.join(', ')}` : '',
    ]
        .filter(part => part !== '')
        .join('  ');
};

export const mentions = ({ pulses }: Turn, only: readonly string[]): boolean =>
    only.length === 0 ||
    pulses.some(({ stream, digest }) =>
        only.some(word => stream.includes(word) || digest.includes(word)),
    );

export const valueAt = (value: unknown, path: string): unknown =>
    path
        .split('.')
        .filter(key => key !== '')
        .reduce<unknown>(
            (node, key) =>
                node instanceof Map
                    ? node.get(key)
                    : node !== null && typeof node === 'object'
                      ? Object.entries(node).find(([own]) => own === key)?.[1]
                      : undefined,
            value,
        );

export const keysAt = (value: unknown): readonly string[] =>
    value instanceof Map
        ? [...value.keys()].map(String)
        : value !== null && typeof value === 'object'
          ? Object.keys(value)
          : [];

export type WindowLine = {
    readonly id: string;
    readonly name: string;
    readonly program: string;
    readonly store: string;
    readonly follows: Readonly<Record<string, string>>;
    readonly frame: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly front: boolean;
    readonly folded: boolean;
};

export const windowsListOf = ({ processes, stores }: Workspace): readonly WindowLine[] =>
    listed(processes).map(({ process, ordinal, focused }) => ({
        id: process.id,
        name: `${declarations[process.program].title} ${ordinal}`,
        program: process.program,
        store: stores.find(({ id }) => id === process.store)?.name ?? process.store,
        follows: Object.fromEntries(
            Object.entries(bindingsOf(process.follows)).map(
                ([input, { store }]): [string, string] => [input, store],
            ),
        ),
        frame: {
            x: Math.round(process.frame.x),
            y: Math.round(process.frame.y),
            width: Math.round(process.frame.width),
            height: Math.round(process.frame.height),
        },
        front: focused,
        folded: process.folded === true,
    }));

export const READING =
    'A turn is everything one event caused before the next microtask. perSecond counts the last windowMs. ' +
    'A stream in doubles fired more than once in one turn: usually one source reaching a combineLatest by two paths, ' +
    'so its readers ran twice, once with a stale half. rewrites are the same in a window: one place in its DOM ' +
    'written more than once in one turn, with every value it held, so a view rendered twice and the first was stale. ' +
    'draws counts each stage the engine drew; redraws is a stage drawn more than once in one animation frame, ' +
    'with why each time (recipe, moment, pass, pointer, frame, dots, samples): GPU work thrown away, or two viewers fighting over one entry.';

export const forAgents = ({ at, windowMs, streams, doubles, recent }: Report) => ({
    reading: READING,
    at,
    windowMs,
    streams: streams.map(({ name, total, perSecond, last, agoMs, doubled }) => ({
        name,
        total,
        perSecond,
        last,
        agoMs,
        doubled,
    })),
    doubles,
    recent,
});

export type Write<T> = { readonly target: T; readonly name: string; readonly old: string | null };

export type Rewritten<T> = {
    readonly target: T;
    readonly name: string;
    readonly olds: readonly (string | null)[];
};

const PIECEWISE = ['style', 'class'];

export const rewritesOf = <T>(writes: readonly Write<T>[]): readonly Rewritten<T>[] =>
    writes
        .filter(({ name }) => !PIECEWISE.includes(name))
        .reduce<readonly Rewritten<T>[]>((grouped, { target, name, old }) => {
            const found = grouped.findIndex(each => each.target === target && each.name === name);
            const group = grouped[found];

            return group === undefined
                ? [...grouped, { target, name, olds: [old] }]
                : grouped.map((each, index) =>
                      index === found ? { ...each, olds: [...each.olds, old] } : each,
                  );
        }, [])
        .filter(({ olds }) => olds.length > 1);

export type Drawing = {
    readonly entry: string;
    readonly lane: string;
    readonly kind: string;
    readonly why: string;
    readonly frame: number | null;
};

export type Redraw = {
    readonly entry: string;
    readonly kind: string;
    readonly whys: readonly string[];
};

export type Draws = {
    readonly frame: number | null;
    readonly seen: ReadonlyMap<string, readonly string[]>;
    readonly redrawn: readonly Redraw[];
};

export const startDraws: Draws = { frame: null, seen: new Map(), redrawn: [] };

export const reduceDraws = (last: Draws, drawings: readonly Drawing[]): Draws => {
    const batch = drawings.filter(({ lane }) => lane === '');
    const frame = batch[0]?.frame ?? null;
    const start =
        frame !== null && frame === last.frame ? last.seen : new Map<string, readonly string[]>();
    const seen = batch.reduce(
        (all, { entry, why }) => new Map(all).set(entry, [...(all.get(entry) ?? []), why]),
        start,
    );

    return {
        frame,
        seen,
        redrawn: batch
            .filter(
                ({ entry, why }, index) =>
                    why !== 'samples' &&
                    ((start.get(entry)?.length ?? 0) > 0 ||
                        batch.slice(0, index).some(each => each.entry === entry)),
            )
            .filter(
                ({ entry }, index, all) => all.findIndex(each => each.entry === entry) === index,
            )
            .map(({ entry, kind }) => ({ entry, kind, whys: seen.get(entry) ?? [] })),
    };
};
