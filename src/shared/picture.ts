export const SIZES = [16, 32, 64] as const;
export type Side = (typeof SIZES)[number];
export const isSide = (value: number): value is Side => SIZES.some(size => size === value);

export const MAX_FRAMES = 12;

// Ink per pixel, 0 to 255, row by row from the top: bytes, so a frame uploads as it is.
export type Frame = readonly number[];

export type Picture = {
    readonly side: Side;
    readonly frames: readonly Frame[];
    readonly fade: boolean;
};

export const blank = (side: Side): Frame => Array.from({ length: side * side }, () => 0);

const ring = (side: Side): Frame =>
    Array.from({ length: side * side }, (_, index) => {
        const x = ((index % side) + 0.5) / side - 0.5;
        const y = (Math.floor(index / side) + 0.5) / side - 0.5;
        const from = Math.abs(Math.hypot(x, y) - 0.3);

        return Math.round(255 * Math.max(0, 1 - from / 0.08));
    });

export const defaultPicture: Picture = { side: 32, frames: [ring(32)], fade: false };

export const frameAt = ({ frames }: Picture, t: number) => (((t % 1) + 1) % 1) * frames.length;

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

const frameFrom = (value: unknown, side: Side): Frame | null =>
    Array.isArray(value) && value.length === side * side
        ? value.map((ink: unknown) =>
              typeof ink === 'number' && Number.isFinite(ink)
                  ? Math.max(0, Math.min(255, Math.round(ink)))
                  : 0,
          )
        : null;

export const parsePicture = (value: unknown): Picture => {
    if (typeof value !== 'object' || value === null) {
        return defaultPicture;
    }

    const stored = field(value, 'side');
    const side = typeof stored === 'number' && isSide(stored) ? stored : null;
    const frames = field(value, 'frames');
    const parsed =
        side === null || !Array.isArray(frames)
            ? []
            : frames.slice(0, MAX_FRAMES).flatMap((frame: unknown) => {
                  const read = frameFrom(frame, side);

                  return read === null ? [] : [read];
              });

    return side === null || parsed.length === 0
        ? defaultPicture
        : { side, frames: parsed, fade: field(value, 'fade') === true };
};
