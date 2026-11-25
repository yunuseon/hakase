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
