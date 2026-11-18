import type { Size } from '../../layout/frame.ts';

export const TABS = ['parameters', 'scene', 'animation'] as const;
export type Tab = (typeof TABS)[number];
export const isTab = (value: string): value is Tab => TABS.some(tab => tab === value);

export const FRAME_RATES = [12, 24, 30, 60] as const;
export type FrameRate = (typeof FRAME_RATES)[number];
export const isFrameRate = (value: number): value is FrameRate =>
    FRAME_RATES.some(rate => rate === value);

export const EXPORT_SIZES = [480, 720, 1080, 1440, 2160] as const;
export type ExportSize = (typeof EXPORT_SIZES)[number];
export const isExportSize = (value: number): value is ExportSize =>
    EXPORT_SIZES.some(size => size === value);

export const ASPECTS = ['1:1', '4:5', '4:3', '3:2', '16:9', '9:16'] as const;
export type Aspect = (typeof ASPECTS)[number];
export const isAspect = (value: unknown): value is Aspect =>
    ASPECTS.some(aspect => aspect === value);
export const DEFAULT_ASPECT: Aspect = '1:1';

export const aspectSize = (aspect: Aspect, long: number): Size => {
    const [width = 1, height = 1] = aspect.split(':').map(Number);
    const scale = long / Math.max(width, height);

    return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

export const FORMATS = ['webm', 'png'] as const;
export type Format = (typeof FORMATS)[number];
export const isFormat = (value: string): value is Format =>
    FORMATS.some(format => format === value);

export const QUALITIES = ['medium', 'high', 'best'] as const;
export type Quality = (typeof QUALITIES)[number];
export const isQuality = (value: string): value is Quality =>
    QUALITIES.some(quality => quality === value);

export type ExportSettings = {
    readonly fps: FrameRate;
    readonly size: ExportSize;
    readonly format: Format;
    readonly quality: Quality;
};

export const defaultExport: ExportSettings = {
    fps: 30,
    size: 1080,
    format: 'webm',
    quality: 'high',
};

export type ExportChange =
    | { readonly field: 'fps' | 'size'; readonly value: number }
    | { readonly field: 'format' | 'quality'; readonly value: string };

export const withExportChange = (
    settings: ExportSettings,
    change: ExportChange,
): ExportSettings => {
    switch (change.field) {
        case 'fps':
            return isFrameRate(change.value) ? { ...settings, fps: change.value } : settings;
        case 'size':
            return isExportSize(change.value) ? { ...settings, size: change.value } : settings;
        case 'format':
            return isFormat(change.value) ? { ...settings, format: change.value } : settings;
        case 'quality':
            return isQuality(change.value) ? { ...settings, quality: change.value } : settings;
    }
};

export const frameCount = (seconds: number, fps: number): number =>
    Math.max(1, Math.round(seconds * fps));

// Even on both sides: VP8 and VP9 encoders reject odd dimensions for 4:2:0 video.
export const exportPixels = ({ width, height }: Size, long: number): Size => {
    const scale = long / Math.max(width, height, 1);
    const even = (side: number) => Math.max(2, 2 * Math.round((side * scale) / 2));

    return { width: even(width), height: even(height) };
};

const BITS_PER_PIXEL: Readonly<Record<Quality, number>> = { medium: 0.06, high: 0.12, best: 0.25 };

export const bitrateOf = ({ width, height }: Size, fps: number, quality: Quality): number =>
    Math.round(width * height * fps * BITS_PER_PIXEL[quality]);

export type ExportFrame = {
    readonly t: number;
    // Its index in the file, or null during the warm-up loop, which is drawn but not kept.
    readonly index: number | null;
};

export const exportFrames = (frames: number, warmUp: boolean): readonly ExportFrame[] => [
    ...(warmUp
        ? Array.from({ length: frames }, (_, index) => ({ t: index / frames, index: null }))
        : []),
    ...Array.from({ length: frames }, (_, index) => ({ t: index / frames, index })),
];

// log2 of frames per tile at the base tile width: 0 is one frame per tile, each step out halves the scale.
export const MAX_LEVEL = 10;

export const isLevel = (value: number): boolean =>
    Number.isFinite(value) && value >= 0 && value <= MAX_LEVEL;
