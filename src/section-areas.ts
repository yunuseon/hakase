import { connectedAreas, subtractArea, touches, unionArea, type Area } from './shared/area.ts';
import type { Rect } from './shared/camera.ts';

export type Section = {
    readonly id: string;
    readonly name: string;
    readonly rects: Area;
};

export const mergeSections = (sections: readonly Section[]): readonly Section[] =>
    sections.reduce<readonly Section[]>((all, section) => {
        const merge = (
            joined: Section,
            rest: readonly Section[],
        ): { joined: Section; rest: readonly Section[] } => {
            const near = rest.filter(s => s.rects.some(a => joined.rects.some(b => touches(a, b))));
            return near.length === 0
                ? { joined, rest }
                : merge(
                      {
                          ...joined,
                          rects: unionArea([...joined.rects, ...near.flatMap(s => s.rects)]),
                      },
                      rest.filter(s => !near.includes(s)),
                  );
        };
        const { joined, rest } = merge(section, all);
        const oldest = all.find(s => !rest.includes(s));
        const result =
            oldest === undefined ? joined : { ...joined, id: oldest.id, name: oldest.name };
        const index = oldest === undefined ? rest.length : all.indexOf(oldest);
        return [...rest.slice(0, index), result, ...rest.slice(index)];
    }, []);

export const eraseSections = (
    sections: readonly Section[],
    cut: Rect,
    seq: number,
): readonly Section[] =>
    sections.flatMap(section =>
        connectedAreas(subtractArea(section.rects, cut)).map((rects, i) => ({
            id: i === 0 ? section.id : `${section.id}-part-${seq}-${i}`,
            name: i === 0 ? section.name : `${section.name} ${i + 1}`,
            rects,
        })),
    );
