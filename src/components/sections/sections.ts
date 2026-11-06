import { sameArea, type Area } from '../../shared/area.ts';
export type SectionView = {
    readonly id: string;
    readonly name: string;
    readonly rects: Area;
};
export type SectionGesture =
    | { readonly kind: 'rename'; readonly id: string; readonly name: string }
    | { readonly kind: 'remove'; readonly id: string };
export const sameSections = (a: readonly SectionView[], b: readonly SectionView[]): boolean =>
    a.length === b.length &&
    a.every((s, i) => {
        const other = b[i];
        return (
            other !== undefined &&
            s.id === other.id &&
            s.name === other.name &&
            sameArea(s.rects, other.rects)
        );
    });
