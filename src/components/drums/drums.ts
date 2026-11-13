import { curveOf } from '../../shared/curve.ts';
import type { Span } from '../../shared/schedule.ts';
import { sameWave, waveAt, waveOf, type Signal, type Wave } from '../../shared/signal.ts';

export const DRUMS = ['kick', 'snare', 'clap', 'hat', 'open', 'tom', 'bell'] as const;
export type Drum = (typeof DRUMS)[number];
export const isDrum = (value: string): value is Drum => DRUMS.some(drum => drum === value);

export const DRUM_LABELS: Readonly<Record<Drum, string>> = {
    kick: 'kick',
    snare: 'snare',
    clap: 'clap',
    hat: 'hat',
    open: 'open hat',
    tom: 'tom',
    bell: 'cowbell',
};

export const STEP_COUNTS = [8, 12, 16, 24, 32] as const;
export type StepCount = (typeof STEP_COUNTS)[number];
export const isStepCount = (value: number): value is StepCount =>
    STEP_COUNTS.some(count => count === value);

export const REPEATS = [1, 2, 4] as const;
export type Repeat = (typeof REPEATS)[number];
export const isRepeat = (value: number): value is Repeat =>
    REPEATS.some(repeat => repeat === value);

export const NORMAL = 0.6;
export const ACCENT = 1;
export const MAX_SWING = 0.5;

export type Pattern = Readonly<Record<Drum, readonly number[]>>;

export type Drums = {
    readonly steps: StepCount;
    readonly repeat: Repeat;
    readonly swing: number;
    readonly volume: number;
    readonly pattern: Pattern;
    readonly sources: { readonly volume: string | null };
};

const strip = (text: string) =>
    [...text].map(mark => (mark === 'X' ? ACCENT : mark === 'x' ? NORMAL : 0));

const empty = (steps: number): Pattern => ({
    kick: Array.from({ length: steps }, () => 0),
    snare: Array.from({ length: steps }, () => 0),
    clap: Array.from({ length: steps }, () => 0),
    hat: Array.from({ length: steps }, () => 0),
    open: Array.from({ length: steps }, () => 0),
    tom: Array.from({ length: steps }, () => 0),
    bell: Array.from({ length: steps }, () => 0),
});

export const PRESETS = {
    'four on the floor': {
        ...empty(16),
        kick: strip('X...X...X...X...'),
        clap: strip('....X.......X...'),
        hat: strip('..x...x...x...x.'),
        open: strip('..............x.'),
    },
    backbeat: {
        ...empty(16),
        kick: strip('X.......X.x.....'),
        snare: strip('....X.......X...'),
        hat: strip('x.x.x.x.x.x.x.x.'),
    },
    breakbeat: {
        ...empty(16),
        kick: strip('X.........X.....'),
        snare: strip('....X..x.x..X..x'),
        hat: strip('x.x.x.x.x.x.x.X.'),
        tom: strip('..............x.'),
    },
    bossa: {
        ...empty(16),
        kick: strip('X..x..X.X..x..X.'),
        hat: strip('xxxxxxxxxxxxxxxx'),
        bell: strip('x..x..x...x..x..'),
        tom: strip('......x........x'),
    },
} as const satisfies Readonly<Record<string, Pattern>>;

export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS).filter(isPresetName);

export function isPresetName(value: string): value is PresetName {
    return Object.keys(PRESETS).includes(value);
}

export const defaultDrums: Drums = {
    steps: 16,
    repeat: 1,
    swing: 0,
    volume: 0.8,
    pattern: PRESETS.backbeat,
    sources: { volume: null },
};

export type DrumsCommand =
    | { readonly kind: 'tap'; readonly drum: Drum; readonly step: number }
    | {
          readonly kind: 'paint';
          readonly drum: Drum;
          readonly step: number;
          readonly like: { readonly drum: Drum; readonly step: number };
      }
    | { readonly kind: 'steps'; readonly steps: StepCount }
    | { readonly kind: 'repeat'; readonly repeat: Repeat }
    | { readonly kind: 'swing'; readonly swing: number }
    | { readonly kind: 'volume'; readonly volume: number }
    | { readonly kind: 'preset'; readonly preset: PresetName }
    | { readonly kind: 'clear' }
    | { readonly kind: 'source'; readonly param: 'volume'; readonly source: string | null };

export type Cell = { readonly drum: Drum; readonly step: number };

// Every cell on the line from one to the other, the first left out: a quick drag skips cells the pointer never stopped on.
export const between = (from: Cell, to: Cell): readonly Cell[] => {
    const rowOf = (drum: Drum) => DRUMS.indexOf(drum);
    const rows = rowOf(to.drum) - rowOf(from.drum);
    const steps = to.step - from.step;
    const count = Math.max(Math.abs(rows), Math.abs(steps));

    return Array.from({ length: count }, (_, index) => {
        const along = (index + 1) / count;

        return {
            drum: DRUMS[rowOf(from.drum) + Math.round(rows * along)] ?? to.drum,
            step: from.step + Math.round(steps * along),
        };
    });
};

// A bar of four beats, whatever the count: 16 steps make beats of four, 12 and 24 of triplets.
export const beatOf = (step: number, steps: number) => Math.floor(step / (steps / 4));

const cycled = (velocity: number) => (velocity === 0 ? NORMAL : velocity < ACCENT ? ACCENT : 0);

const withCell = (drums: Drums, drum: Drum, step: number, velocity: number): Drums =>
    step < 0 || step >= drums.steps || drums.pattern[drum][step] === velocity
        ? drums
        : {
              ...drums,
              pattern: {
                  ...drums.pattern,
                  [drum]: drums.pattern[drum].map((value, index) =>
                      index === step ? velocity : value,
                  ),
              },
          };

export const resampled = (pattern: Pattern, from: number, to: number): Pattern => {
    const row = (values: readonly number[]) =>
        values.reduce<readonly number[]>(
            (made, velocity, step) => {
                const into = Math.round((step * to) / from) % to;

                return velocity === 0
                    ? made
                    : made.map((value, index) =>
                          index === into ? Math.max(value, velocity) : value,
                      );
            },
            Array.from({ length: to }, () => 0),
        );

    return {
        kick: row(pattern.kick),
        snare: row(pattern.snare),
        clap: row(pattern.clap),
        hat: row(pattern.hat),
        open: row(pattern.open),
        tom: row(pattern.tom),
        bell: row(pattern.bell),
    };
};

const within = (value: number, low: number, high: number) =>
    Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : null;

export const reduceDrums = (drums: Drums, command: DrumsCommand): Drums => {
    switch (command.kind) {
        case 'tap':
            return withCell(
                drums,
                command.drum,
                command.step,
                cycled(drums.pattern[command.drum][command.step] ?? 0),
            );
        case 'paint':
            return withCell(
                drums,
                command.drum,
                command.step,
                drums.pattern[command.like.drum][command.like.step] ?? 0,
            );
        case 'steps':
            return command.steps === drums.steps
                ? drums
                : {
                      ...drums,
                      steps: command.steps,
                      pattern: resampled(drums.pattern, drums.steps, command.steps),
                  };
        case 'repeat':
            return command.repeat === drums.repeat ? drums : { ...drums, repeat: command.repeat };
        case 'swing': {
            const swing = within(command.swing, 0, MAX_SWING);

            return swing === null || swing === drums.swing ? drums : { ...drums, swing };
        }
        case 'volume': {
            const volume = within(command.volume, 0, 1);

            return volume === null || volume === drums.volume ? drums : { ...drums, volume };
        }
        case 'preset':
            return {
                ...drums,
                pattern: resampled(PRESETS[command.preset], 16, drums.steps),
            };
        case 'clear':
            return { ...drums, pattern: empty(drums.steps) };
        case 'source':
            return drums.sources.volume === command.source
                ? drums
                : { ...drums, sources: { volume: command.source } };
    }
};

export type Kit = { readonly drums: Drums; readonly volume: Wave | null };

export const kitOf = (drums: Drums, signals: ReadonlyMap<string, Signal>): Kit => ({
    drums,
    volume: drums.sources.volume === null ? null : waveOf(signals, drums.sources.volume),
});

export const sameKit = (a: Kit, b: Kit) =>
    a.drums === b.drums &&
    (a.volume === null || b.volume === null ? a.volume === b.volume : sameWave(a.volume, b.volume));

export type Hit = Span & { readonly drum: Drum; readonly velocity: number };

export const hitsOf = ({ steps, repeat, swing, pattern }: Drums): readonly Hit[] =>
    Array.from({ length: repeat }, (_, round) =>
        Array.from({ length: steps }, (__, step) =>
            DRUMS.flatMap((drum): Hit[] => {
                const velocity = pattern[drum][step] ?? 0;
                const from = (round + (step + (step % 2 === 1 ? swing : 0)) / steps) / repeat;

                return velocity === 0
                    ? []
                    : [{ from, to: from + 1 / (steps * repeat), carried: false, drum, velocity }];
            }),
        ).flat(),
    ).flat();

export const swellOf = ({ drums, volume }: Kit, t: number) =>
    drums.volume * (volume === null ? 1 : Math.min(1, Math.max(0, waveAt(volume, t))));

export const DECAYS: Readonly<Record<Drum, number>> = {
    kick: 0.35,
    snare: 0.18,
    clap: 0.22,
    hat: 0.05,
    open: 0.35,
    tom: 0.3,
    bell: 0.25,
};

const WEIGHTS: Readonly<Record<Drum, number>> = {
    kick: 1,
    snare: 0.8,
    clap: 0.7,
    hat: 0.25,
    open: 0.4,
    tom: 0.7,
    bell: 0.5,
};

const lastOf = (hits: readonly Hit[], at: number) =>
    hits.filter(({ from }) => from <= at).at(-1) ?? hits.at(-1);

const drumLevelAt = (hits: readonly Hit[], drum: Drum, t: number, seconds: number) => {
    const at = ((t % 1) + 1) % 1;
    const hit = lastOf(
        hits.filter(own => own.drum === drum),
        at,
    );

    if (hit === undefined) {
        return 0;
    }

    const since = (at - hit.from + (hit.from > at ? 1 : 0)) * seconds;

    return hit.velocity * Math.exp((-3 * since) / DECAYS[drum]);
};

export const kitLevelAt = (kit: Kit, hits: readonly Hit[], t: number, seconds: number) =>
    swellOf(kit, t) *
    Math.min(
        1,
        DRUMS.reduce((sum, drum) => sum + WEIGHTS[drum] * drumLevelAt(hits, drum, t, seconds), 0),
    );

export const kitCurve = (kit: Kit, seconds: number) => {
    const hits = hitsOf(kit.drums);

    return curveOf(t => kitLevelAt(kit, hits, t, seconds));
};

export const drumCurve = (kit: Kit, drum: Drum, seconds: number) => {
    const hits = hitsOf(kit.drums);

    return curveOf(t => swellOf(kit, t) * drumLevelAt(hits, drum, t, seconds));
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const rowFrom = (value: unknown, steps: number) =>
    Array.from({ length: steps }, (_, index) => {
        const read: unknown = Array.isArray(value) ? value[index] : undefined;

        return typeof read === 'number' && Number.isFinite(read)
            ? Math.min(1, Math.max(0, read))
            : 0;
    });

export const parseDrums = (value: unknown): Drums => {
    if (typeof value !== 'object' || value === null) {
        return defaultDrums;
    }

    const steps = field(value, 'steps');
    const repeat = field(value, 'repeat');
    const swing = field(value, 'swing');
    const volume = field(value, 'volume');
    const pattern = field(value, 'pattern');
    const sources = field(value, 'sources');
    const count = typeof steps === 'number' && isStepCount(steps) ? steps : defaultDrums.steps;
    const row = (drum: Drum) =>
        rowFrom(
            typeof pattern === 'object' && pattern !== null ? field(pattern, drum) : undefined,
            count,
        );
    const source =
        typeof sources === 'object' && sources !== null ? field(sources, 'volume') : null;

    return {
        steps: count,
        repeat: typeof repeat === 'number' && isRepeat(repeat) ? repeat : defaultDrums.repeat,
        swing: typeof swing === 'number' ? (within(swing, 0, MAX_SWING) ?? 0) : 0,
        volume:
            typeof volume === 'number'
                ? (within(volume, 0, 1) ?? defaultDrums.volume)
                : defaultDrums.volume,
        pattern:
            typeof pattern === 'object' && pattern !== null
                ? {
                      kick: row('kick'),
                      snare: row('snare'),
                      clap: row('clap'),
                      hat: row('hat'),
                      open: row('open'),
                      tom: row('tom'),
                      bell: row('bell'),
                  }
                : resampled(defaultDrums.pattern, 16, count),
        sources: { volume: typeof source === 'string' ? source : null },
    };
};
