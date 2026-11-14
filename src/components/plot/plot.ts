import type { Driver } from '../../shared/curve.ts';
import { driverAt, samplesOf } from '../../shared/signal.ts';

export const WIDTH = 400;
export const HEIGHT = 120;
const SAMPLES = 320;
const LANE_GAP = 8;

export const LAYOUTS = ['overlay', 'lanes'] as const;
export type Layout = (typeof LAYOUTS)[number];
export const isLayout = (value: string): value is Layout =>
    LAYOUTS.some(layout => layout === value);

export type Trace = {
    readonly key: string;
    readonly label: string;
    readonly colour: string;
    readonly driver: Driver;
};

export type Lane = {
    readonly key: string;
    readonly colour: string;
    readonly label: string;
    readonly path: string;
    readonly top: number;
    readonly height: number;
    readonly min: number;
    readonly max: number;
    readonly zero: number | null;
};

export type Scale = {
    readonly top: number;
    readonly height: number;
    readonly min: number;
    readonly max: number;
};

// A flat line gets room around it, or dividing by its span would put it nowhere.
const fitted = (values: readonly number[]) => {
    const low = Math.min(...values);
    const high = Math.max(...values);

    return high - low < 1e-9 ? { min: low - 0.5, max: high + 0.5 } : { min: low, max: high };
};

const yIn = ({ top, height, min, max }: Scale, value: number) =>
    top + height - ((value - min) / (max - min)) * height;

const pathOf = (samples: readonly number[], scale: Scale) =>
    samples
        .map(
            (value, index) =>
                `${index === 0 ? 'M' : 'L'}${((index / (samples.length - 1)) * WIDTH).toFixed(2)} ${yIn(scale, value).toFixed(2)}`,
        )
        .join(' ');

export const lanesOf = (traces: readonly Trace[], layout: Layout): readonly Lane[] => {
    const sampled = traces.map(trace => ({ trace, samples: samplesOf(trace.driver, SAMPLES) }));
    const shared = fitted(sampled.flatMap(({ samples }) => samples));
    const count = layout === 'lanes' ? Math.max(sampled.length, 1) : 1;
    const height = (HEIGHT - LANE_GAP * (count - 1)) / count;

    return sampled.map(({ trace, samples }, index) => {
        const bounds = layout === 'lanes' ? fitted(samples) : shared;
        const scale = {
            top: layout === 'lanes' ? index * (height + LANE_GAP) : 0,
            height,
            ...bounds,
        };

        return {
            key: trace.key,
            colour: trace.colour,
            label: trace.label,
            path: pathOf(samples, scale),
            ...scale,
            zero: bounds.min < 0 && bounds.max > 0 ? yIn(scale, 0) : null,
        };
    });
};

export const boundsOf = (lanes: readonly Lane[], layout: Layout) =>
    (layout === 'lanes' ? lanes : lanes.slice(0, 1)).flatMap(lane => [
        { text: valueText(lane.max), y: lane.top, low: false },
        { text: valueText(lane.min), y: lane.top + lane.height, low: true },
    ]);

export const readingsAt = (traces: readonly Trace[], lanes: readonly Lane[], t: number) =>
    traces.flatMap(trace => {
        const lane = lanes.find(({ key }) => key === trace.key);
        const value = driverAt(trace.driver, t);

        return lane === undefined
            ? []
            : [{ key: trace.key, value, x: t * WIDTH, y: yIn(lane, value) }];
    });

export const valueText = (value: number) => {
    const size = Math.abs(value);

    return size >= 100 ? value.toFixed(0) : size >= 10 ? value.toFixed(1) : value.toFixed(2);
};

export const atOf = (x: number, width: number) => Math.min(1, Math.max(0, x / Math.max(width, 1)));
