import { DRIVES, samePanel, type Panel, type Signals } from './components/sketch/params.ts';
import { sameOrbit, type Orbit } from './components/sketch/space.ts';
import { sameTheme, type Theme } from './components/sketch/theme.ts';
import { PEDALS, valueOf, type Pedal } from './pedals.ts';
import { driverAt, type Driver } from './shared/curve.ts';
import { sameWave } from './shared/signal.ts';
import type { Sheet } from './shared/stroke.ts';

export type PointsImage = {
    readonly kind: 'points';
    readonly store: string;
    readonly source: string;
    readonly panel: Panel;
    readonly theme: Theme;
    readonly orbit: Orbit;
    readonly drivers: Signals;
    readonly sheet: Sheet | null;
};

export type PedalImage = {
    readonly kind: 'pedal';
    readonly store: string;
    readonly pedal: Pedal;
    readonly theme: Theme | null;
    readonly drivers: Readonly<Record<string, Driver | null>>;
    readonly inputs: readonly Image[];
};

// A cable carries this, never pixels: a description the engine cooks at the follower's own moment.
export type Image = { readonly kind: 'none' } | PointsImage | PedalImage;

export const NONE: Image = { kind: 'none' };

const sameDriver = (a: Driver | null, b: Driver | null): boolean =>
    a === null || b === null
        ? a === b
        : 'samples' in a || 'samples' in b
          ? a === b
          : sameWave(a, b);

export const sameImage = (a: Image, b: Image): boolean => {
    if (a === b) {
        return true;
    }

    switch (a.kind) {
        case 'none':
            return b.kind === 'none';
        case 'points':
            return (
                b.kind === 'points' &&
                a.store === b.store &&
                a.source === b.source &&
                samePanel(a.panel, b.panel) &&
                sameTheme(a.theme, b.theme) &&
                sameOrbit(a.orbit, b.orbit) &&
                a.sheet === b.sheet &&
                DRIVES.every(drive => sameDriver(a.drivers[drive], b.drivers[drive]))
            );
        case 'pedal':
            return (
                b.kind === 'pedal' &&
                a.store === b.store &&
                a.pedal === b.pedal &&
                (a.theme === null || b.theme === null
                    ? a.theme === b.theme
                    : sameTheme(a.theme, b.theme)) &&
                PEDALS[a.pedal.kind].knobs.every(({ name }) =>
                    sameDriver(a.drivers[name] ?? null, b.drivers[name] ?? null),
                ) &&
                a.inputs.length === b.inputs.length &&
                a.inputs.every((input, index) => {
                    const other = b.inputs[index];

                    return other !== undefined && sameImage(input, other);
                })
            );
    }
};

// Inputs before what reads them, each stage once however many cables lead to it.
export const stagesOf = (image: Image): readonly (PointsImage | PedalImage)[] => {
    const visit = (
        stages: readonly (PointsImage | PedalImage)[],
        node: Image,
    ): readonly (PointsImage | PedalImage)[] => {
        if (node.kind === 'none' || stages.some(({ store }) => store === node.store)) {
            return stages;
        }

        return node.kind === 'points'
            ? [...stages, node]
            : [...node.inputs.reduce(visit, stages), node];
    };

    return visit([], image);
};

// A knob a cable drives plays the driver's value as it is, kept inside the knob's range; otherwise its own setting.
export const knobAt = (image: PedalImage, name: string, t: number): number => {
    const spec = PEDALS[image.pedal.kind].knobs.find(knob => knob.name === name);
    const driver = image.drivers[name] ?? null;

    if (spec === undefined) {
        return 0;
    }

    return driver === null
        ? valueOf(image.pedal, name)
        : Math.min(spec.max, Math.max(spec.min, driverAt(driver, t)));
};
