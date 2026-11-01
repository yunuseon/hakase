import {
    defaultExport,
    isExportSize,
    isFormat,
    isFrameRate,
    isLevel,
    isQuality,
    isTab,
    type ExportSettings,
    type Tab,
} from './components/sketch/animation.ts';
import {
    groupChanged,
    withChange,
    type ControlChange,
    type ControlsView,
} from './components/sketch/controls/controls.ts';
import { isFormulaId, type FormulaId } from './library.ts';
import {
    DRAW_MODES,
    defaultPanel,
    isCycles,
    isDrawMode,
    type Cycles,
    type Knob,
    type Knobs,
    type Motion,
    type Panel,
} from './components/sketch/params.ts';
import {
    DEFAULT_ORBIT,
    isFit,
    isLattice,
    isLens,
    isSpace,
    sameOrbit,
    type Fit,
    type Lattice,
    type Lens,
    type Space,
    type Orbit,
} from './components/sketch/space.ts';
import { isThemeName, type ThemeName } from './components/sketch/themes/registry.ts';
import { clamp } from './lib/math.ts';

export type SketchSettings = {
    readonly kind: 'sketch';
    readonly formula: FormulaId;
    readonly theme: ThemeName;
    readonly panel: Panel;
    readonly orbit: Orbit;
    readonly tab: Tab;
    readonly stripLevel: number;
    readonly export: ExportSettings;
};

export type FormulaEditorSettings = {
    readonly kind: 'formula';
    readonly formula: FormulaId;
};

export type ThemeEditorSettings = {
    readonly kind: 'theme';
    readonly theme: ThemeName;
};

export type NoteSettings = {
    readonly kind: 'note';
    readonly note: string | null;
};

export type Settings = SketchSettings | FormulaEditorSettings | ThemeEditorSettings | NoteSettings;

export const defaultSketch: SketchSettings = {
    kind: 'sketch',
    formula: 'ripple',
    theme: 'paper',
    panel: defaultPanel,
    orbit: DEFAULT_ORBIT,
    tab: 'parameters',
    stripLevel: 2,
    export: defaultExport,
};

export const defaultFormulaEditor: FormulaEditorSettings = { kind: 'formula', formula: 'ripple' };

export const defaultThemeEditor: ThemeEditorSettings = { kind: 'theme', theme: 'paper' };

export const asSketch = (settings: Settings | undefined): SketchSettings =>
    settings?.kind === 'sketch' ? settings : defaultSketch;

export const asFormulaEditor = (settings: Settings | undefined): FormulaEditorSettings =>
    settings?.kind === 'formula' ? settings : defaultFormulaEditor;

export const defaultNote: NoteSettings = { kind: 'note', note: null };

export const asNote = (settings: Settings | undefined): NoteSettings =>
    settings?.kind === 'note' ? settings : defaultNote;

export const asThemeEditor = (settings: Settings | undefined): ThemeEditorSettings =>
    settings?.kind === 'theme' ? settings : defaultThemeEditor;

export const controlsView = ({
    formula,
    theme,
    panel,
    orbit,
    tab,
}: SketchSettings): ControlsView => {
    const turned = !sameOrbit(orbit, DEFAULT_ORBIT);

    return {
        ...panel,
        formula,
        theme,
        tab,
        turned,
        changed: {
            parameters: groupChanged(panel, 'parameters'),
            sampling: groupChanged(panel, 'sampling'),
            space: groupChanged(panel, 'space'),
            drawing: groupChanged(panel, 'drawing'),
            // The view is part of the camera, so a turned camera is something to reset too.
            camera: groupChanged(panel, 'camera') || turned,
        },
    };
};

export const withControl = (sketch: SketchSettings, change: ControlChange): SketchSettings => {
    if (change.field === 'formula') {
        return isFormulaId(change.value) ? { ...sketch, formula: change.value } : sketch;
    }

    if (change.field === 'theme') {
        return isThemeName(change.value) ? { ...sketch, theme: change.value } : sketch;
    }

    if (change.field === 'tab') {
        return isTab(change.value) ? { ...sketch, tab: change.value } : sketch;
    }

    const panel = withChange(sketch.panel, change);

    return change.field === 'reset' && change.group === 'camera'
        ? { ...sketch, panel, orbit: DEFAULT_ORBIT }
        : { ...sketch, panel };
};

const finite = (value: unknown, fallback: number, min: number, max: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const knobsFrom = (value: unknown): Knobs => {
    const stored = typeof value === 'object' && value !== null ? value : {};
    const knob = (name: Knob): number =>
        finite(field(stored, name), defaultPanel.knobs[name], 0, 1);

    return { k1: knob('k1'), k2: knob('k2'), k3: knob('k3'), k4: knob('k4') };
};

const latticeFrom = (panel: object): Lattice => {
    const lattice = field(panel, 'lattice');

    return typeof lattice === 'string' && isLattice(lattice) ? lattice : defaultPanel.lattice;
};

const spaceFrom = (panel: object): Space => {
    const space = field(panel, 'space');

    return typeof space === 'string' && isSpace(space) ? space : defaultPanel.space;
};

const lensFrom = (panel: object): Lens => {
    const lens = field(panel, 'lens');

    return typeof lens === 'string' && isLens(lens) ? lens : defaultPanel.lens;
};

const fitFrom = (panel: object): Fit => {
    const fit = field(panel, 'fit');

    return typeof fit === 'string' && isFit(fit) ? fit : defaultPanel.fit;
};

const motionFrom = (value: unknown): Motion => {
    const stored = typeof value === 'object' && value !== null ? value : {};
    const cycles = (name: Knob): Cycles => {
        const count = field(stored, name);

        return typeof count === 'number' && isCycles(count) ? count : 0;
    };

    return { k1: cycles('k1'), k2: cycles('k2'), k3: cycles('k3'), k4: cycles('k4') };
};

// Field by field with a default for each, so a setting added later never discards the rest.
const panelFrom = (value: unknown): Panel => {
    if (typeof value !== 'object' || value === null) {
        return defaultPanel;
    }

    const mode = field(value, 'mode');

    return {
        mode: typeof mode === 'string' && isDrawMode(mode) ? mode : DRAW_MODES[0],
        dimension: Math.round(finite(field(value, 'dimension'), defaultPanel.dimension, 1, 128)),
        baseSize: finite(field(value, 'baseSize'), defaultPanel.baseSize, 1, 20),
        depthScalar: finite(field(value, 'depthScalar'), defaultPanel.depthScalar, 0.01, 2),
        trails: finite(field(value, 'trails'), defaultPanel.trails, 0, 0.97),
        knobs: knobsFrom(field(value, 'knobs')),
        motion: motionFrom(field(value, 'motion')),
        axes: field(value, 'axes') === true,
        fit: fitFrom(value),
        lens: lensFrom(value),
        lattice: latticeFrom(value),
        focus: finite(field(value, 'focus'), defaultPanel.focus, 0.3, 3),
        space: spaceFrom(value),
    };
};

const orbitFrom = (value: unknown): Orbit => {
    if (typeof value !== 'object' || value === null) {
        return DEFAULT_ORBIT;
    }

    return {
        yaw: finite(field(value, 'yaw'), DEFAULT_ORBIT.yaw, -1e6, 1e6),
        pitch: finite(field(value, 'pitch'), DEFAULT_ORBIT.pitch, -Math.PI / 2, Math.PI / 2),
        distance: finite(field(value, 'distance'), DEFAULT_ORBIT.distance, 1, 30),
    };
};

const exportFrom = (value: unknown): ExportSettings => {
    const stored = typeof value === 'object' && value !== null ? value : {};
    const fps = field(stored, 'fps');
    const size = field(stored, 'size');
    const format = field(stored, 'format');
    const quality = field(stored, 'quality');

    return {
        fps: typeof fps === 'number' && isFrameRate(fps) ? fps : defaultExport.fps,
        size: typeof size === 'number' && isExportSize(size) ? size : defaultExport.size,
        format: typeof format === 'string' && isFormat(format) ? format : defaultExport.format,
        quality:
            typeof quality === 'string' && isQuality(quality) ? quality : defaultExport.quality,
    };
};

const tabFrom = (value: unknown): Tab =>
    typeof value === 'string' && isTab(value) ? value : defaultSketch.tab;

const stripLevelFrom = (value: unknown): number =>
    typeof value === 'number' && isLevel(value) ? value : defaultSketch.stripLevel;

const formulaFrom = (value: unknown): FormulaId | null =>
    typeof value === 'string' && isFormulaId(value) ? value : null;

const themeFrom = (value: unknown): ThemeName | null =>
    typeof value === 'string' && isThemeName(value) ? value : null;

export const parseSettings = (value: unknown): Settings | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    switch (field(value, 'kind')) {
        case 'sketch':
            return {
                kind: 'sketch',
                formula: formulaFrom(field(value, 'formula')) ?? defaultSketch.formula,
                theme: themeFrom(field(value, 'theme')) ?? defaultSketch.theme,
                panel: panelFrom(field(value, 'panel')),
                orbit: orbitFrom(field(value, 'orbit')),
                tab: tabFrom(field(value, 'tab')),
                stripLevel: stripLevelFrom(field(value, 'stripLevel')),
                export: exportFrom(field(value, 'export')),
            };
        case 'formula':
            return {
                kind: 'formula',
                formula: formulaFrom(field(value, 'formula')) ?? defaultFormulaEditor.formula,
            };
        case 'theme':
            return {
                kind: 'theme',
                theme: themeFrom(field(value, 'theme')) ?? defaultThemeEditor.theme,
            };
        case 'note': {
            const note = field(value, 'note');

            return { kind: 'note', note: typeof note === 'string' ? note : null };
        }
        default:
            return null;
    }
};
