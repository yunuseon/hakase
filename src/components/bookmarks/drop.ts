export type Shelf = {
    readonly id: string;
    readonly top: number;
    readonly bottom: number;
    readonly middles: readonly number[];
};

export type Target = {
    readonly group: string;
    readonly to: number;
};

const distanceTo = (y: number, { top, bottom }: Shelf): number =>
    y < top ? top - y : y > bottom ? y - bottom : 0;

export const dropTarget = (y: number, shelves: readonly Shelf[]): Target | null => {
    const shelf = shelves.reduce<Shelf | null>(
        (best, candidate) =>
            best === null || distanceTo(y, candidate) < distanceTo(y, best) ? candidate : best,
        null,
    );

    return shelf === null
        ? null
        : { group: shelf.id, to: shelf.middles.filter(middle => middle < y).length };
};
