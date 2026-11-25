export const SLOTS = 16;

export const partsOf = (samples: number): number => Math.round(samples * SLOTS);

export type Pass = {
    readonly slots: 1 | typeof SLOTS;
    readonly phase: number;
    readonly count: number;
    readonly batch: number;
};

export const passesTo = (from: number, to: number, each: number): readonly Pass[] => {
    const passes: Pass[] = [];
    let at = from;

    while (at < to) {
        const whole = at % SLOTS === 0 ? Math.min(Math.floor((to - at) / SLOTS), each) : 0;

        const phase = at % SLOTS;
        const count = Math.min(SLOTS - phase, to - at);

        if (whole > 0) {
            passes.push({ slots: 1, phase: 0, count: 1, batch: whole });
            at += whole * SLOTS;
        } else {
            passes.push({ slots: SLOTS, phase, count, batch: 1 });
            at += count;
        }
    }

    return passes;
};

export type Pace = {
    readonly parts: number;
    readonly step: number;
    readonly last: number | null;
};

export const ON_TIME_MS = 18;
export const LATE_MS = 20;
export const MAX_STEP = 16 * SLOTS;

export const startPace = (parts: number): Pace => ({ parts, step: SLOTS / 4, last: null });

export const paced = (pace: Pace, now: number, cap: number): Pace => {
    const gap = pace.last === null ? 0 : now - pace.last;
    const step =
        pace.last === null
            ? pace.step
            : gap <= ON_TIME_MS
              ? Math.min(MAX_STEP, pace.step + 1)
              : gap > LATE_MS
                ? Math.max(1, Math.floor(pace.step / 2))
                : pace.step;

    return { parts: Math.min(partsOf(cap), pace.parts + step), step, last: now };
};

export const MOVING_SIDES = [128, 160, 192, 224, 256, 320, 384] as const;

export type Moving = {
    readonly rung: number;
    readonly late: number;
    readonly calm: number;
    readonly last: number | null;
};

export const startMoving: Moving = {
    rung: MOVING_SIDES.indexOf(256),
    late: 0,
    calm: 0,
    last: null,
};

export const CALM_FRAMES = 30;
const LATE_FRAMES = 2;
const UNRELATED_MS = 100;

export const movedAt = (moving: Moving, now: number): Moving => {
    const gap = moving.last === null ? null : now - moving.last;

    if (gap === null || gap > UNRELATED_MS) {
        return { ...moving, late: 0, calm: 0, last: now };
    }

    if (gap > LATE_MS) {
        const late = moving.late + 1;

        return late >= LATE_FRAMES
            ? { rung: Math.max(0, moving.rung - 1), late: 0, calm: 0, last: now }
            : { ...moving, late, calm: 0, last: now };
    }

    const calm = gap <= ON_TIME_MS ? moving.calm + 1 : 0;

    return calm >= CALM_FRAMES
        ? { rung: Math.min(MOVING_SIDES.length - 1, moving.rung + 1), late: 0, calm: 0, last: now }
        : { ...moving, late: 0, calm, last: now };
};

export const movingSide = ({ rung }: Moving): number => MOVING_SIDES[rung] ?? 256;
