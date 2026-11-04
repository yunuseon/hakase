import {
    commandOf,
    sameEnd,
    wirePath,
    type End,
    type StateCommand,
} from '../../shared/connections.ts';

export type Socket = {
    readonly key: string;
    readonly window: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly menu: { readonly above: boolean; readonly height: number };
    readonly title: string;
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
    }[];
    readonly group: string | null;
    readonly hidden: boolean;
};

export type GroupRow = {
    readonly key: string;
    readonly window: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly title: string;
    readonly open: boolean;
    readonly bound: number;
    readonly total: number;
    readonly colour: string;
    readonly members: readonly string[];
};

const GROUP = ':group:';

export const groupKey = (window: string, group: string) => `${window}${GROUP}${group}`;

export const windowOfGroup = (key: string) => key.slice(0, Math.max(0, key.indexOf(GROUP)));

export type WiringView = {
    readonly sockets: readonly Socket[];
    readonly groups: readonly GroupRow[];
    readonly wires: readonly {
        readonly path: string;
        readonly colour: string;
        readonly shared: boolean;
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
    | { readonly kind: 'land'; readonly to: string | null };

export const anchorOf = (socket: Socket) => ({
    x: socket.x + (socket.end.kind === 'store' ? socket.width - 10 : 10),
    y: socket.y + 14,
});

export const connectionOf = (from: Socket, to: Socket) => {
    const [source, target] = from.end.kind === 'store' ? [from, to] : [to, from];
    const end = source.end;

    if (end.kind !== 'store' || !target.options.some(option => option.id === end.id)) {
        return null;
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

    if (event.kind === 'toggle') {
        const group = groupAt(event.group);

        return group === undefined ? null : { kind: 'expand', key: group.key, open: !group.open };
    }

    if (event.kind === 'hover') {
        const group = groupAt(event.group);
        const from = socketAt(event.from);
        const takes =
            group !== undefined &&
            from !== undefined &&
            group.members.some(key => {
                const member = socketAt(key);

                return member !== undefined && connectionOf(from, member) !== null;
            });

        return group === undefined || !takes || group.open
            ? null
            : { kind: 'spring', key: group.key };
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

export const wiresOf = (sockets: readonly Socket[]): WiringView['wires'] =>
    sockets.flatMap(target => {
        const showing = (socket: Socket) =>
            socket.end.kind === 'store' && socket.end.id === target.current;
        const source = sockets.find(socket => showing(socket) && socket.key !== target.key);
        const shared = target.end.kind === 'store';

        if (source === undefined || (shared && sockets.find(showing)?.key === target.key)) {
            return [];
        }

        return [
            { path: wirePath(anchorOf(source), anchorOf(target)), colour: source.colour, shared },
        ];
    });

const sameSocket = (a: Socket, b: Socket) =>
    a.key === b.key &&
    a.window === b.window &&
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
            option.source === other.source
        );
    });

const sameGroup = (a: GroupRow, b: GroupRow) =>
    a.key === b.key &&
    a.window === b.window &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.title === b.title &&
    a.open === b.open &&
    a.bound === b.bound &&
    a.total === b.total &&
    a.colour === b.colour &&
    a.members.join() === b.members.join();

export const sameWiring = (a: WiringView | null, b: WiringView | null) =>
    a === null || b === null
        ? a === b
        : a.sockets.length === b.sockets.length &&
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
                  wire.shared === other.shared
              );
          });
