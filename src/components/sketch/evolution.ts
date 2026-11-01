export type Front = 0 | 1;

export type Evolved = {
    readonly step: number;
    readonly front: Front;
};

export type Evolution = {
    readonly reset: boolean;
    // Steps from + 1 up to and including to are run.
    readonly from: number;
    readonly to: number;
    readonly start: Front;
    readonly end: Evolved;
};

export type Clock = {
    readonly t: number;
    readonly seconds: number;
};

export const stepAt = (t: number, seconds: number, steps: number): number =>
    Math.max(0, Math.floor(t * seconds * steps + 1e-6));

const flipped = (front: Front, passes: number): Front =>
    passes % 2 === 0 ? front : front === 0 ? 1 : 0;

export const evolutionTo = (done: Evolved | null, target: number): Evolution => {
    if (done === null || target < done.step) {
        // The seed is a pass of its own, so the replay ends on the texture after 1 + target passes.
        return {
            reset: true,
            from: 0,
            to: target,
            start: 0,
            end: { step: target, front: flipped(0, 1 + target) },
        };
    }

    return {
        reset: false,
        from: done.step,
        to: target,
        start: done.front,
        end: { step: target, front: flipped(done.front, target - done.step) },
    };
};

export const momentOf = (step: number, seconds: number, steps: number): number =>
    step / Math.max(seconds * steps, 1);

export const evolutionsFor = (targets: readonly number[]): readonly Evolution[] =>
    targets.reduce<readonly Evolution[]>(
        (planned, target) => [...planned, evolutionTo(planned.at(-1)?.end ?? null, target)],
        [],
    );
