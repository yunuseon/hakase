export type SeamView = {
    readonly a: string;
    readonly b: string;
    readonly x: number;
    readonly y: number;
    readonly vertical: boolean;
    readonly linked: boolean;
};

export type SeamToggle = {
    readonly a: string;
    readonly b: string;
};

export const sameSeams = (first: readonly SeamView[], second: readonly SeamView[]): boolean =>
    first.length === second.length &&
    first.every((seam, index) => {
        const other = second[index];

        return (
            other !== undefined &&
            seam.a === other.a &&
            seam.b === other.b &&
            seam.x === other.x &&
            seam.y === other.y &&
            seam.vertical === other.vertical &&
            seam.linked === other.linked
        );
    });
