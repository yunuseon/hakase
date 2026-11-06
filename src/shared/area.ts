import type { Point, Rect } from './camera.ts';

export type Area = readonly Rect[];

export const overlaps = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export const touches = (a: Rect, b: Rect): boolean =>
    overlaps(a, b) ||
    ((a.x + a.width === b.x || b.x + b.width === a.x) &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height) ||
    ((a.y + a.height === b.y || b.y + b.height === a.y) &&
        a.x < b.x + b.width &&
        b.x < a.x + a.width);

export const areaContains = (area: Area, p: Point): boolean =>
    area.some(r => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height);

export const boundsOf = (rects: Area): Rect => {
    if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const x = Math.min(...rects.map(r => r.x));
    const y = Math.min(...rects.map(r => r.y));
    return {
        x,
        y,
        width: Math.max(...rects.map(r => r.x + r.width)) - x,
        height: Math.max(...rects.map(r => r.y + r.height)) - y,
    };
};

export const subtractRect = (a: Rect, b: Rect): Area => {
    if (!overlaps(a, b)) return [a];
    const x = Math.max(a.x, b.x),
        y = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    return [
        { x: a.x, y: a.y, width: a.width, height: y - a.y },
        { x: a.x, y: bottom, width: a.width, height: a.y + a.height - bottom },
        { x: a.x, y, width: x - a.x, height: bottom - y },
        { x: right, y, width: a.x + a.width - right, height: bottom - y },
    ].filter(r => r.width > 0 && r.height > 0);
};

const coalesced = (rects: Area): Area => {
    const pair = rects
        .flatMap((a, i) =>
            rects
                .slice(i + 1)
                .flatMap((b, j) =>
                    (a.y === b.y &&
                        a.height === b.height &&
                        (a.x + a.width === b.x || b.x + b.width === a.x)) ||
                    (a.x === b.x &&
                        a.width === b.width &&
                        (a.y + a.height === b.y || b.y + b.height === a.y))
                        ? [{ i, j: i + j + 1, rect: boundsOf([a, b]) }]
                        : [],
                ),
        )
        .at(0);
    return pair === undefined
        ? rects
        : coalesced([...rects.filter((_, i) => i !== pair.i && i !== pair.j), pair.rect]);
};

export const unionArea = (rects: Area): Area =>
    [
        ...coalesced(
            rects.reduce<Area>(
                (area, r) =>
                    r.width <= 0 || r.height <= 0
                        ? area
                        : [
                              ...area,
                              ...area.reduce<Area>(
                                  (pieces, occupied) =>
                                      pieces.flatMap(piece => subtractRect(piece, occupied)),
                                  [r],
                              ),
                          ],
                [],
            ),
        ),
    ].sort((a, b) => a.y - b.y || a.x - b.x);

export const subtractArea = (area: Area, cut: Rect): Area =>
    unionArea(area.flatMap(r => subtractRect(r, cut)));

export const connectedAreas = (area: Area): readonly Area[] => {
    const first = area[0];
    if (first === undefined) return [];
    const grow = (group: Area, rest: Area): { group: Area; rest: Area } => {
        const near = rest.filter(r => group.some(g => touches(r, g)));
        return near.length === 0
            ? { group, rest }
            : grow(
                  [...group, ...near],
                  rest.filter(r => !near.includes(r)),
              );
    };
    const { group, rest } = grow([first], area.slice(1));
    return [unionArea(group), ...connectedAreas(rest)];
};

export const areaFill = (area: Area): string =>
    area.map(r => `M${r.x} ${r.y}h${r.width}v${r.height}h${-r.width}Z`).join('');

type Edge = {
    readonly axis: 'x' | 'y';
    readonly at: number;
    readonly from: number;
    readonly to: number;
    readonly side: -1 | 1;
};
const edgesOf = (r: Rect): readonly Edge[] => [
    { axis: 'x', at: r.y, from: r.x, to: r.x + r.width, side: -1 },
    { axis: 'x', at: r.y + r.height, from: r.x, to: r.x + r.width, side: 1 },
    { axis: 'y', at: r.x, from: r.y, to: r.y + r.height, side: -1 },
    { axis: 'y', at: r.x + r.width, from: r.y, to: r.y + r.height, side: 1 },
];
export const areaOutline = (area: Area): string => {
    const edges = area.flatMap(edgesOf);
    return edges
        .flatMap(edge =>
            edges
                .filter(
                    other =>
                        other.axis === edge.axis &&
                        other.at === edge.at &&
                        other.side !== edge.side,
                )
                .reduce<readonly Edge[]>(
                    (pieces, other) =>
                        pieces.flatMap(p =>
                            other.from >= p.to || other.to <= p.from
                                ? [p]
                                : [
                                      { ...p, to: Math.max(p.from, other.from) },
                                      { ...p, from: Math.min(p.to, other.to) },
                                  ].filter(e => e.to > e.from),
                        ),
                    [edge],
                ),
        )
        .map(e => (e.axis === 'x' ? `M${e.from} ${e.at}H${e.to}` : `M${e.at} ${e.from}V${e.to}`))
        .join('');
};

export const sameArea = (a: Area, b: Area): boolean =>
    a.length === b.length &&
    a.every((r, i) => {
        const s = b[i];
        return (
            s !== undefined &&
            r.x === s.x &&
            r.y === s.y &&
            r.width === s.width &&
            r.height === s.height
        );
    });
