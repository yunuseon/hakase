export type Block = {
    readonly id: string;
    readonly day: string;
    readonly start: number;
    readonly end: number;
    readonly title: string;
};

export type Agenda = {
    readonly blocks: readonly Block[];
    readonly made: number;
};

export type AgendaCommand =
    | {
          readonly kind: 'add';
          readonly id: string;
          readonly day: string;
          readonly start: number;
          readonly end: number;
      }
    | { readonly kind: 'move'; readonly id: string; readonly start: number }
    | { readonly kind: 'resize'; readonly id: string; readonly end: number }
    | { readonly kind: 'rename'; readonly id: string; readonly title: string }
    | { readonly kind: 'remove'; readonly id: string };

export const SNAP = 15;
export const DAY_MINUTES = 24 * 60;

export const emptyAgenda: Agenda = { blocks: [], made: 0 };

const numberOf = (id: string): number => Number(/-(\d+)$/.exec(id)?.[1] ?? 0);

export const nextBlockId = ({ made }: Agenda): string => `block-${made + 1}`;

export const snapped = (minutes: number): number =>
    Math.min(Math.max(Math.round(minutes / SNAP) * SNAP, 0), DAY_MINUTES);

const changed = (agenda: Agenda, id: string, change: (block: Block) => Block): Agenda => ({
    ...agenda,
    blocks: agenda.blocks.map(block => (block.id === id ? change(block) : block)),
});

export const reduceAgenda = (agenda: Agenda, command: AgendaCommand): Agenda => {
    switch (command.kind) {
        case 'add': {
            const start = snapped(Math.min(command.start, DAY_MINUTES - SNAP));
            const end = Math.max(snapped(command.end), start + SNAP);

            return agenda.blocks.some(({ id }) => id === command.id)
                ? agenda
                : {
                      made: Math.max(agenda.made, numberOf(command.id)),
                      blocks: [
                          ...agenda.blocks,
                          { id: command.id, day: command.day, start, end, title: '' },
                      ],
                  };
        }
        case 'move':
            return changed(agenda, command.id, block => {
                const length = block.end - block.start;
                const start = Math.min(snapped(command.start), DAY_MINUTES - length);

                return { ...block, start, end: start + length };
            });
        case 'resize':
            return changed(agenda, command.id, block => ({
                ...block,
                end: Math.max(snapped(command.end), block.start + SNAP),
            }));
        case 'rename':
            return changed(agenda, command.id, block => ({
                ...block,
                title: command.title.trim(),
            }));
        case 'remove':
            return { ...agenda, blocks: agenda.blocks.filter(({ id }) => id !== command.id) };
    }
};

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

export const timeOf = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const blockFrom = (value: unknown): Block | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    if (!(
        'id' in value &&
        'day' in value &&
        'start' in value &&
        'end' in value &&
        'title' in value
    )) {
        return null;
    }

    const { id, day, start, end, title } = value;

    return typeof id === 'string' &&
        typeof day === 'string' &&
        typeof title === 'string' &&
        typeof start === 'number' &&
        typeof end === 'number' &&
        start >= 0 &&
        end > start &&
        end <= DAY_MINUTES
        ? { id, day, start, end, title }
        : null;
};

export const parseAgenda = (value: unknown): Agenda => {
    if (typeof value !== 'object' || value === null || !('blocks' in value && 'made' in value)) {
        return emptyAgenda;
    }

    const { blocks, made } = value;

    if (!Array.isArray(blocks) || typeof made !== 'number' || !Number.isInteger(made)) {
        return emptyAgenda;
    }

    const kept = blocks.map(blockFrom).filter(block => block !== null);

    return { blocks: kept, made: Math.max(made, 0, ...kept.map(({ id }) => numberOf(id))) };
};
