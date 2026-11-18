import { DRUMS, type Drum } from '../../model/drums.ts';

export type Cell = { readonly drum: Drum; readonly step: number };

// Every cell on the line from one to the other, the first left out: a quick drag skips cells the pointer never stopped on.
export const between = (from: Cell, to: Cell): readonly Cell[] => {
    const rowOf = (drum: Drum) => DRUMS.indexOf(drum);
    const rows = rowOf(to.drum) - rowOf(from.drum);
    const steps = to.step - from.step;
    const count = Math.max(Math.abs(rows), Math.abs(steps));

    return Array.from({ length: count }, (_, index) => {
        const along = (index + 1) / count;

        return {
            drum: DRUMS[rowOf(from.drum) + Math.round(rows * along)] ?? to.drum,
            step: from.step + Math.round(steps * along),
        };
    });
};
