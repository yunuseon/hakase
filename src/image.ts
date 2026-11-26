import { DRIVES, samePanel, type Panel, type Signals } from './model/sketch/params.ts';
import { sameOrbit, type Orbit } from './model/sketch/space.ts';
import { sameTheme, type Theme } from './model/sketch/theme.ts';
import { PEDALS, valueOf, type Pedal } from './pedals.ts';
import { type Driver } from './shared/curve.ts';
import { driverAt, sameDriver } from './shared/signal.ts';
import type { Sheet } from './shared/stroke.ts';
import { SCENE_KNOBS, type Scene, type SceneKnob } from './model/scene.ts';

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

export type TracedImage = {
    readonly kind: 'traced';
    readonly store: string;
    readonly scene: Scene;
    readonly theme: Theme;
    readonly drivers: Readonly<Record<SceneKnob, Driver | null>>;
};

export type Stage = PointsImage | PedalImage | TracedImage;

export type Image = { readonly kind: 'none' } | Stage;

export const NONE: Image = { kind: 'none' };

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
        case 'traced':
            return (
                b.kind === 'traced' &&
                a.store === b.store &&
                a.scene === b.scene &&
                sameTheme(a.theme, b.theme) &&
                SCENE_KNOBS.every(knob => sameDriver(a.drivers[knob], b.drivers[knob]))
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

export const stagesOf = (image: Image): readonly Stage[] => {
    const visit = (stages: readonly Stage[], node: Image): readonly Stage[] => {
        if (node.kind === 'none' || stages.some(({ store }) => store === node.store)) {
            return stages;
        }

        return node.kind !== 'pedal'
            ? [...stages, node]
            : [...node.inputs.reduce(visit, stages), node];
    };

    return visit([], image);
};

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

export const stillOf = (image: Image): Image => {
    switch (image.kind) {
        case 'none':
        case 'traced':
            return image;
        case 'points':
            return {
                ...image,
                panel: { ...image.panel, trails: 0 },
                drivers: { ...image.drivers, trails: null },
            };
        case 'pedal':
            return { ...image, inputs: image.inputs.map(stillOf) };
    }
};

export const hasHistory = (image: Image): boolean =>
    stagesOf(image).some(stage =>
        stage.kind === 'pedal'
            ? stage.pedal.kind === 'feedback'
            : stage.kind === 'points' && (stage.panel.trails > 0 || stage.drivers.trails !== null),
    );

export const sceneKnobAt = (image: TracedImage, knob: SceneKnob, t: number): number => {
    const driver = image.drivers[knob];

    return driver === null ? image.scene.knobs[knob] : driverAt(driver, t);
};

export const samplesWanted = (image: Image, purpose: 'preview' | 'export'): number =>
    stagesOf(image).reduce(
        (most, stage) => (stage.kind === 'traced' ? Math.max(most, stage.scene[purpose]) : most),
        1,
    );
