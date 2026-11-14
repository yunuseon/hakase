import { GATES, sourceOfGate, type Bit, type Gate } from './gates.ts';
import { CURVE_SAMPLES, type Curve, type Driver } from './shared/curve.ts';
import { driverAt } from './shared/signal.ts';

export type Table = ReadonlyMap<string, Uint8Array>;

const evaluated = (
    gate: Gate,
    tick: number,
    ticks: number,
    bitAt: (param: string) => Bit,
    driver: Driver | null,
): Bit => {
    switch (gate.kind) {
        case 'nand':
            return bitAt('a') === 1 && bitAt('b') === 1 ? 0 : 1;
        case 'switch':
            return gate.value;
        case 'pattern':
            return gate.steps[Math.floor((tick * gate.steps.length) / ticks)] ?? 0;
        case 'compare':
            return driver !== null && driverAt(driver, tick / ticks) >= gate.threshold ? 1 : 0;
        case 'lamp':
        case 'pin-in':
        case 'pin-out':
            return bitAt('in');
        case 'delay':
            return 0;
    }
};

export const circuitTable = (
    gates: ReadonlyMap<string, Gate>,
    ticks: number,
    drivers: ReadonlyMap<string, Driver> = new Map(),
    outside: ReadonlyMap<string, Driver> = new Map(),
): Table => {
    const ids = [...gates.keys()];
    const index = new Map(ids.map((id, at) => [id, at]));
    const all = ids.flatMap(id => {
        const gate = gates.get(id);

        return gate === undefined ? [] : [gate];
    });
    const inputOf = (gate: Gate, param: string): number => {
        const source = sourceOfGate(gate, param);

        return source === null ? -1 : (index.get(source) ?? -1);
    };
    const needs = all.map(gate =>
        gate.kind === 'delay'
            ? []
            : GATES[gate.kind].bits.map(param => inputOf(gate, param)).filter(at => at >= 0),
    );
    const waiting = needs.map(list => list.length);
    const readers = all.map((): number[] => []);
    needs.forEach((list, at) => {
        list.forEach(source => {
            readers[source]?.push(at);
        });
    });
    const order: number[] = waiting.flatMap((count, at) => (count === 0 ? [at] : []));
    for (let next = 0; next < order.length; next += 1) {
        (readers[order[next] ?? 0] ?? []).forEach(reader => {
            waiting[reader] = (waiting[reader] ?? 0) - 1;
            if (waiting[reader] === 0) {
                order.push(reader);
            }
        });
    }

    const rows = all.map(() => new Uint8Array(ticks));
    const readAt = (gate: Gate, param: string, tick: number): Bit => {
        const source = sourceOfGate(gate, param);
        const at = source === null ? -1 : (index.get(source) ?? -1);
        const driver = source === null || at >= 0 ? undefined : outside.get(source);

        return at >= 0
            ? rows[at]?.[tick] === 1
                ? 1
                : 0
            : driver !== undefined && driverAt(driver, tick / ticks) >= 0.5
              ? 1
              : 0;
    };

    for (let tick = 0; tick < ticks; tick += 1) {
        all.forEach((gate, at) => {
            if (gate.kind === 'delay') {
                const row = rows[at];

                if (row !== undefined) {
                    row[tick] = tick === 0 ? 0 : readAt(gate, 'in', tick - 1);
                }
            }
        });
        order.forEach(at => {
            const gate = all[at];
            const row = rows[at];

            if (gate === undefined || row === undefined || gate.kind === 'delay') {
                return;
            }

            const bitAt = (param: string): Bit => readAt(gate, param, tick);

            row[tick] = evaluated(gate, tick, ticks, bitAt, drivers.get(ids[at] ?? '') ?? null);
        });
    }

    return new Map(ids.map((id, at) => [id, rows[at] ?? new Uint8Array(ticks)]));
};

export const bitCurve = (row: Uint8Array): Curve => ({
    samples: Float32Array.from(
        { length: CURVE_SAMPLES },
        (_, index) => row[Math.floor((index * row.length) / CURVE_SAMPLES)] ?? 0,
    ),
});

export const tickAt = (t: number, ticks: number): number =>
    Math.min(ticks - 1, Math.max(0, Math.floor((((t % 1) + 1) % 1) * ticks)));
