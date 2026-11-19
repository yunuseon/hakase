import {
    commandOf,
    sameEnd,
    tracePath,
    wirePath,
    type WireStyle,
    type End,
    type StateCommand,
} from '../../shared/connections.ts';

export type Socket = {
    readonly key: string;
    readonly window: string;
    readonly z: number;
    readonly side: 'left' | 'right';
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly menu: { readonly above: boolean; readonly height: number };
    readonly title: string;
    readonly type: string | null;
    readonly colour: string;
    readonly end: End;
    readonly receiver: End | null;
    readonly current: string;
    readonly optional: boolean;
    readonly options: readonly {
        readonly id: string;
        readonly name: string;
        readonly colour: string;
        readonly source: string;
        readonly via: string | null;
        readonly hint: string;
    }[];
    readonly span: readonly [number, number];
    readonly group: string | null;
    readonly hidden: boolean;
};

export type GroupRow = {
    readonly key: string;
    readonly window: string;
    readonly z: number;
    readonly side: 'left' | 'right';
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly title: string;
    readonly open: boolean;
    readonly bound: number;
    readonly total: number;
    readonly colour: string;
    readonly members: readonly string[];
    readonly folded: boolean;
};

const GROUP = ':group:';

export const groupKey = (window: string, group: string) => `${window}${GROUP}${group}`;

export const windowOfGroup = (key: string) => key.slice(0, Math.max(0, key.indexOf(GROUP)));

export type WiringView = {
    readonly all: boolean;
    readonly unit: number;
    readonly rowHeight: number;
    readonly sockets: readonly Socket[];
    readonly groups: readonly GroupRow[];
    readonly wires: readonly {
        readonly path: string;
        readonly colour: string;
        readonly shared: boolean;
        readonly from: string;
        readonly to: string;
    }[];
};

export type WiringCommand =
    | { readonly kind: 'wire'; readonly command: StateCommand }
    | { readonly kind: 'manage'; readonly window: string }
    | { readonly kind: 'busy'; readonly key: string; readonly busy: boolean }
    | { readonly kind: 'expand'; readonly key: string; readonly open: boolean }
    | { readonly kind: 'spring'; readonly key: string }
    | { readonly kind: 'settle'; readonly group: string | null };

export type WiringEvent =
    | Exclude<WiringCommand, { kind: 'wire' | 'expand' | 'spring' | 'settle' }>
    | { readonly kind: 'select'; readonly key: string; readonly value: string }
    | { readonly kind: 'drag'; readonly from: string; readonly to: string }
    | { readonly kind: 'toggle'; readonly group: string }
    | { readonly kind: 'hover'; readonly group: string; readonly from: string }
    | { readonly kind: 'drop'; readonly group: string; readonly from: string }
    | { readonly kind: 'land'; readonly to: string | null };

export const anchorOf = (socket: Socket, unit: number, rowHeight = 28 * unit) => ({
    x: socket.x + (socket.side === 'left' ? socket.width - 10 * unit : 10 * unit),
    y: socket.y + rowHeight / 2,
});

export const connectionOf = (from: Socket, to: Socket) => {
    const [source, target] = from.end.kind === 'store' ? [from, to] : [to, from];
    const end = source.end;

    if (end.kind !== 'store') {
        return null;
    }

    const option = target.options.find(each => each.id === end.id);

    if (option === undefined) {
        return null;
    }

    if (option.via !== null) {
        return selectionOf(target, option.id);
    }

    return (
        commandOf(end, target.end) ??
        (target.receiver === null ? null : commandOf(end, target.receiver))
    );
};

export const selectionOf = (socket: Socket, value: string) => {
    if (value === '' && socket.optional) {
        return commandOf(socket.end, null);
    }

    const option = socket.options.find(option => option.id === value);

    if (option?.via != null && socket.end.kind === 'port') {
        const [low, high] = socket.span;

        return {
            kind: 'convert',
            converter: option.via,
            source: option.id,
            owner: socket.end.owner,
            sink: socket.end.sink,
            input: socket.end.input,
            window: socket.window,
            low,
            high,
        } satisfies StateCommand;
    }

    return option === undefined
        ? null
        : commandOf(
              {
                  kind: 'store',
                  id: option.id,
                  program: socket.end.kind === 'store' ? socket.end.program : '',
                  feeds: option.source,
              },
              socket.receiver ?? socket.end,
          );
};

export const commandFor = (view: WiringView | null, event: WiringEvent): WiringCommand | null => {
    if (event.kind === 'manage' || event.kind === 'busy') {
        return event;
    }

    if (view === null) {
        return null;
    }

    const socketAt = (key: string | null) => view.sockets.find(socket => socket.key === key);
    const groupAt = (key: string) => view.groups.find(group => group.key === key);

    const takers = (group: GroupRow, from: Socket) =>
        group.members.flatMap(key => {
            const member = socketAt(key);
            const command = member === undefined ? null : connectionOf(from, member);

            return command === null ? [] : [command];
        });

    if (event.kind === 'toggle') {
        const group = groupAt(event.group);

        return group === undefined || group.folded
            ? null
            : { kind: 'expand', key: group.key, open: !group.open };
    }

    if (event.kind === 'hover') {
        const group = groupAt(event.group);
        const from = socketAt(event.from);
        const takes = group !== undefined && from !== undefined && takers(group, from).length > 0;

        return group === undefined || !takes || group.open || group.folded
            ? null
            : { kind: 'spring', key: group.key };
    }

    if (event.kind === 'drop') {
        const group = groupAt(event.group);
        const from = socketAt(event.from);
        const commands = group === undefined || from === undefined ? [] : takers(group, from);
        const [only] = commands;

        return group === undefined || !group.folded || commands.length === 0
            ? null
            : commands.length === 1 && only !== undefined
              ? { kind: 'wire', command: only }
              : { kind: 'manage', window: group.window };
    }

    if (event.kind === 'land') {
        return { kind: 'settle', group: socketAt(event.to)?.group ?? null };
    }

    if (event.kind === 'select') {
        const socket = socketAt(event.key);
        const command = socket === undefined ? null : selectionOf(socket, event.value);

        return command === null ? null : { kind: 'wire', command };
    }

    const from = socketAt(event.from);
    const to = socketAt(event.to);
    const command = from === undefined || to === undefined ? null : connectionOf(from, to);

    return command === null ? null : { kind: 'wire', command };
};

export const wiresOf = (
    sockets: readonly Socket[],
    unit: number,
    rowHeight = 28 * unit,
    style: WireStyle = 'curves',
): WiringView['wires'] =>
    sockets.flatMap(target => {
        const showing = (socket: Socket) =>
            socket.end.kind === 'store' && socket.end.id === target.current;
        const source = sockets.find(socket => showing(socket) && socket.key !== target.key);
        const shared = target.end.kind === 'store';

        if (source === undefined || (shared && sockets.find(showing)?.key === target.key)) {
            return [];
        }

        return [
            {
                path:
                    style === 'traces'
                        ? tracePath(
                              anchorOf(source, unit, rowHeight),
                              anchorOf(target, unit, rowHeight),
                              16 * unit,
                              8 * unit,
                          )
                        : wirePath(
                              anchorOf(source, unit, rowHeight),
                              anchorOf(target, unit, rowHeight),
                          ),
                colour: source.colour,
                shared,
                from: source.key,
                to: target.key,
            },
        ];
    });

const sameSocket = (a: Socket, b: Socket) =>
    a.key === b.key &&
    a.window === b.window &&
    a.z === b.z &&
    a.side === b.side &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.menu.above === b.menu.above &&
    a.menu.height === b.menu.height &&
    a.title === b.title &&
    a.colour === b.colour &&
    a.current === b.current &&
    a.optional === b.optional &&
    a.group === b.group &&
    a.hidden === b.hidden &&
    a.span[0] === b.span[0] &&
    a.span[1] === b.span[1] &&
    sameEnd(a.end, b.end) &&
    (a.receiver === null || b.receiver === null
        ? a.receiver === b.receiver
        : sameEnd(a.receiver, b.receiver)) &&
    a.options.length === b.options.length &&
    a.options.every((option, index) => {
        const other = b.options[index];

        return (
            other !== undefined &&
            option.id === other.id &&
            option.name === other.name &&
            option.colour === other.colour &&
            option.source === other.source &&
            option.via === other.via &&
            option.hint === other.hint
        );
    });

const sameGroup = (a: GroupRow, b: GroupRow) =>
    a.key === b.key &&
    a.window === b.window &&
    a.z === b.z &&
    a.side === b.side &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.title === b.title &&
    a.open === b.open &&
    a.bound === b.bound &&
    a.total === b.total &&
    a.colour === b.colour &&
    a.folded === b.folded &&
    a.members.join() === b.members.join();

export const sameWiring = (a: WiringView | null, b: WiringView | null) =>
    a === null || b === null
        ? a === b
        : a.all === b.all &&
          a.unit === b.unit &&
          a.rowHeight === b.rowHeight &&
          a.sockets.length === b.sockets.length &&
          a.sockets.every((socket, index) => {
              const other = b.sockets[index];

              return other !== undefined && sameSocket(socket, other);
          }) &&
          a.groups.length === b.groups.length &&
          a.groups.every((group, index) => {
              const other = b.groups[index];

              return other !== undefined && sameGroup(group, other);
          }) &&
          a.wires.length === b.wires.length &&
          a.wires.every((wire, index) => {
              const other = b.wires[index];

              return (
                  other !== undefined &&
                  wire.path === other.path &&
                  wire.colour === other.colour &&
                  wire.shared === other.shared &&
                  wire.from === other.from &&
                  wire.to === other.to
              );
          });

export const SPARK = { width: 48, height: 16, samples: 48 } as const;

export const sparkOf = (values: readonly number[]): string => {
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = high > low ? high - low : 1;
    const inset = 1.5;
    const y = (value: number) =>
        high > low
            ? SPARK.height - inset - ((value - low) / span) * (SPARK.height - 2 * inset)
            : SPARK.height / 2;

    return values
        .map(
            (value, index) =>
                `${index === 0 ? 'M' : 'L'}${((index / Math.max(1, values.length - 1)) * SPARK.width).toFixed(1)} ${y(value).toFixed(1)}`,
        )
        .join(' ');
};

export type Previews = {
    readonly key: string | null;
    readonly paths: ReadonlyMap<string, string>;
};
