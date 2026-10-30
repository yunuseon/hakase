export type TaskRow = {
    readonly id: string;
    readonly label: string;
    // Path data on a 24x24 viewBox, stroked rather than filled.
    readonly icon: string;
    readonly focused: boolean;
};

export const sameTaskRows = (a: readonly TaskRow[], b: readonly TaskRow[]): boolean =>
    a.length === b.length &&
    a.every((row, index) => {
        const other = b[index];

        return (
            other !== undefined &&
            row.id === other.id &&
            row.label === other.label &&
            row.icon === other.icon &&
            row.focused === other.focused
        );
    });
