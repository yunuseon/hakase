export type Command = {
    readonly id: string;
    readonly label: string;
    // Only a key or a keyword: a word repeated on every row is read as none.
    readonly hint: string;
    readonly keyword: string | null;
    readonly group: string;
    readonly icon: string | null;
};

export type Entry =
    | { readonly kind: 'heading'; readonly title: string }
    | { readonly kind: 'row'; readonly match: Match; readonly index: number };

export const entriesOf = (shown: readonly Match[]): readonly Entry[] =>
    shown.flatMap((match, index): Entry[] => {
        const row: Entry = { kind: 'row', match, index };

        return shown[index - 1]?.command.group === match.command.group
            ? [row]
            : [{ kind: 'heading', title: match.command.group }, row];
    });

export type Match = { readonly command: Command; readonly text: string | null };

const normalised = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

export const matches = (commands: readonly Command[], query: string): readonly Command[] => {
    const words = normalised(query)
        .split(' ')
        .filter(word => word !== '');

    return commands.filter(({ label, hint, group }) => {
        const text = normalised(`${label} ${hint} ${group}`);

        return words.every(word => text.includes(word));
    });
};

export const matched = (commands: readonly Command[], query: string): readonly Match[] => {
    const typed = query.trim();
    const [first = ''] = typed.split(/\s/, 1);
    const text = typed.slice(first.length).trim();
    const taking = commands.filter(({ keyword }) => keyword === first.toLowerCase());

    return taking.length > 0 && text !== ''
        ? taking.map(command => ({ command, text }))
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
            command.keyword === other.keyword &&
            command.group === other.group &&
            command.icon === other.icon
        );
    });
