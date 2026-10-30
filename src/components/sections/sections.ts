export type SectionView = {
    readonly id: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};

export type SectionGesture =
    | {
          readonly kind: 'move' | 'resize';
          readonly id: string;
          readonly dx: number;
          readonly dy: number;
      }
    | { readonly kind: 'rename'; readonly id: string; readonly name: string }
    | { readonly kind: 'remove'; readonly id: string };

export const sameSections = (a: readonly SectionView[], b: readonly SectionView[]): boolean =>
    a.length === b.length &&
    a.every((section, index) => {
        const other = b[index];

        return (
            other !== undefined &&
            section.id === other.id &&
            section.name === other.name &&
            section.x === other.x &&
            section.y === other.y &&
            section.width === other.width &&
            section.height === other.height
        );
    });
