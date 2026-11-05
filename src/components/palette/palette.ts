export type Command = {
    readonly id: string;
    readonly label: string;
    // A short word on the right: what kind of thing it does, or its key.
    readonly hint: string;
    readonly keyword: string | null;
};

export type Match = { readonly command: Command; readonly text: string | null };

const normalised = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

// Every word of the query must appear somewhere in the label or hint, in any order.
export const matches = (commands: readonly Command[], query: string): readonly Command[] => {
    const words = normalised(query)
        .split(' ')
        .filter(word => word !== '');

    return commands.filter(({ label, hint }) => {
        const text = normalised(`${label} ${hint}`);

        return words.every(word => text.includes(word));
    });
};

export const matched = (commands: readonly Command[], query: string): readonly Match[] => {
    const typed = query.trim();
    const [first = ''] = typed.split(/\s/, 1);
    const text = typed.slice(first.length).trim();
    const taking = commands.find(({ keyword }) => keyword === first.toLowerCase());

    return taking !== undefined && text !== ''
        ? [{ command: taking, text }]
        : matches(commands, query).map(command => ({ command, text: null }));
};

export const sameCommands = (a: readonly Command[], b: readonly Command[]): boolean =>
    a.length === b.length &&
    a.every((command, index) => {
        const other = b[index];

        return (
            other !== undefined &&
            command.id === other.id &&
            command.label === other.label &&
            command.hint === other.hint &&
            command.keyword === other.keyword
        );
    });
