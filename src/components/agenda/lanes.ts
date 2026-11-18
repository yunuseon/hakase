import type { Block } from '../../model/agenda.ts';

export type Placed = Block & {
    readonly lane: number;
    readonly lanes: number;
};

export const laidOut = (blocks: readonly Block[]): readonly Placed[] => {
    const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
    const groups = sorted.reduce<Block[][]>((all, block) => {
        const group = all.at(-1);
        const reach = group === undefined ? -1 : Math.max(...group.map(({ end }) => end));

        return group !== undefined && block.start < reach
            ? [...all.slice(0, -1), [...group, block]]
            : [...all, [block]];
    }, []);

    return groups.flatMap(group => {
        const lanes = group.reduce<{ ends: number[]; placed: Placed[] }>(
            ({ ends, placed }, block) => {
                const free = ends.findIndex(end => end <= block.start);
                const lane = free < 0 ? ends.length : free;
                const next = [...ends];
                next[lane] = block.end;

                return { ends: next, placed: [...placed, { ...block, lane, lanes: 0 }] };
            },
            { ends: [], placed: [] },
        );

        return lanes.placed.map(block => ({ ...block, lanes: lanes.ends.length }));
    });
};
