import { DEFAULT_WIRE_STYLE, type WireStyle } from './shared/connections.ts';
import { inputGroups } from './input-connections.ts';
import {
    definitionOf,
    followedStores,
    madeBy,
    SOURCES,
    spanOf,
    UNIT_SPAN,
    type Bindings,
    type InputsFor,
} from './inputs.ts';
import {
    groupKey,
    windowOfGroup,
    wiresOf,
    type GroupRow,
    type Socket,
    type WiringView,
} from './components/state-wiring/wiring.ts';
import { colourOf, HOLDING, withMain } from './stores.ts';
import { CONVERTERS, isConverterKind } from './converters.ts';
import type { Linked } from './shared/signal.ts';
import type { Box } from './boxes.ts';
import type { Traced } from './why.ts';
import { boxOf, ownsInputs, type Draft, type Workspace } from './workspace.ts';

export type StateMode = { readonly active: boolean };

export type ModeCommand = { readonly kind: 'enter' | 'toggle' | 'close' };

export const defaultMode: StateMode = { active: false };

export const reduceMode = (mode: StateMode, command: ModeCommand): StateMode =>
    command.kind === 'enter'
        ? { active: true }
        : command.kind === 'close' || mode.active
          ? defaultMode
          : { active: true };

export type ModeAction =
    | ModeCommand
    | { readonly kind: 'hold'; readonly held: boolean }
    | { readonly kind: 'busy'; readonly key: string; readonly busy: boolean }
    | { readonly kind: 'blur' }
    | { readonly kind: 'windows'; readonly ids: readonly string[] }
    | { readonly kind: 'expand'; readonly key: string; readonly open: boolean }
    | { readonly kind: 'spring'; readonly key: string }
    | { readonly kind: 'settle'; readonly group: string | null };

export type ModeSession = {
    readonly pinned: StateMode;
    readonly held: boolean;
    readonly locks: readonly string[];
    readonly open: readonly string[];
    readonly sprung: string | null;
};

export const defaultSession: ModeSession = {
    pinned: defaultMode,
    held: false,
    locks: [],
    open: [],
    sprung: null,
};

export const reduceSession = (session: ModeSession, action: ModeAction): ModeSession => {
    switch (action.kind) {
        case 'close':
            return { ...defaultSession, open: session.open };
        case 'windows':
            return {
                ...session,
                locks: session.locks.filter(
                    key => !key.startsWith('menu:') || action.ids.includes(key.slice(5)),
                ),
                open: session.open.filter(key => action.ids.includes(windowOfGroup(key))),
                sprung:
                    session.sprung !== null && action.ids.includes(windowOfGroup(session.sprung))
                        ? session.sprung
                        : null,
            };
        case 'blur':
            return { ...session, held: false, locks: [], sprung: null };
        case 'expand':
            return {
                ...session,
                open: [
                    ...session.open.filter(key => windowOfGroup(key) !== windowOfGroup(action.key)),
                    ...(action.open ? [action.key] : []),
                ],
            };
        case 'spring':
            return { ...session, sprung: action.key };
        case 'settle':
            return action.group === null
                ? { ...session, sprung: null }
                : {
                      ...reduceSession(session, { kind: 'expand', key: action.group, open: true }),
                      sprung: null,
                  };
        case 'hold':
            return { ...session, held: action.held };
        case 'busy':
            // Only a drag may start the mode, to show every target; any other lock only keeps it on.
            return action.busy && action.key !== 'drag' && !modeOf(session).active
                ? session
                : {
                      ...session,
                      locks: action.busy
                          ? [...new Set([...session.locks, action.key])]
                          : session.locks.filter(key => key !== action.key),
                  };
        default:
            return { ...session, pinned: reduceMode(session.pinned, action) };
    }
};

export type Engaged = { readonly hovered: string | null; readonly peeking: boolean };

export type EngageAction =
    | { readonly kind: 'hover'; readonly id: string; readonly over: boolean }
    | { readonly kind: 'shift'; readonly held: boolean }
    | { readonly kind: 'windows'; readonly ids: readonly string[] };

export const disengaged: Engaged = { hovered: null, peeking: false };

export const peekedOf = ({ hovered, peeking }: Engaged): string | null =>
    peeking ? hovered : null;

export const reduceEngaged = (engaged: Engaged, action: EngageAction): Engaged => {
    switch (action.kind) {
        case 'hover':
            // Leaving a window keeps it while Shift is held: its tabs stick out past its edge, and the pointer must reach them.
            return action.over
                ? engaged.hovered === action.id
                    ? engaged
                    : { ...engaged, hovered: action.id }
                : engaged.hovered === action.id && !engaged.peeking
                  ? { ...engaged, hovered: null }
                  : engaged;
        case 'shift':
            return action.held === engaged.peeking ? engaged : { ...engaged, peeking: action.held };
        case 'windows':
            return engaged.hovered === null || action.ids.includes(engaged.hovered)
                ? engaged
                : { ...engaged, hovered: null };
    }
};

export const modeOf = ({ pinned, held, locks }: ModeSession) => ({
    active: pinned.active || held || locks.length > 0,
});

export const windowZ = (index: number) => (index + 1) * 2;

const behindWindow = (index: number) => windowZ(index) - 1;

const TAB_WIDTH = 150;

export const wiredCount = (
    linked: ReadonlyMap<string, Linked>,
    process: { readonly store: string; readonly follows: Bindings },
): number =>
    Object.entries(process.follows).filter(([name]) => name !== 'playback').length +
    Object.values(linked.get(process.store)?.sources ?? {}).filter(source => source !== null)
        .length;

const readsFrom = (
    linked: ReadonlyMap<string, Linked>,
    process: { readonly store: string; readonly follows: Bindings },
): ReadonlySet<string> =>
    new Set([
        ...followedStores(process.follows),
        ...Object.values(linked.get(process.store)?.sources ?? {}).flatMap(source =>
            source === null ? [] : [source],
        ),
    ]);

const INDENT = 14;

export const REACH = 18;

type Row =
    | { readonly kind: 'input'; readonly name: string; readonly group: string | null }
    | {
          readonly kind: 'group';
          readonly key: string;
          readonly title: string;
          readonly members: readonly string[];
      };

const openGroupIn = ({ open, sprung }: ModeSession, window: string) =>
    sprung !== null && windowOfGroup(sprung) === window
        ? sprung
        : (open.find(key => windowOfGroup(key) === window) ?? null);

export const wiringOf = (
    workspace: Workspace,
    signals: ReadonlyMap<string, Linked>,
    inputsFor: InputsFor,
    session: ModeSession,
    unit: number,
    touch = false,
    loops: ReadonlyMap<string, Linked> = signals,
    boxes: ReadonlyMap<string, Box> = new Map(),
    pinNames: ReadonlyMap<string, string> = new Map(),
    style: WireStyle = DEFAULT_WIRE_STYLE,
    engaged: Engaged = disengaged,
    traced: Traced | null = null,
): WiringView | null => {
    const mode = modeOf(session);
    const { processes, stores } = workspace;
    const tracing = mode.active ? null : traced;
    const peeked = peekedOf(engaged);
    const focused =
        mode.active || tracing !== null ? undefined : processes.find(({ id }) => id === peeked);
    const sources = focused === undefined ? new Set<string>() : readsFrom(signals, focused);
    const near = (process: (typeof processes)[number]) =>
        tracing !== null
            ? tracing.windows.has(process.id)
            : focused !== undefined &&
              process.id !== focused.id &&
              (sources.has(process.store) || readsFrom(signals, process).has(focused.store));
    const whole = (process: (typeof processes)[number]) =>
        mode.active || (tracing === null && process.id === peeked);
    const onPath = (process: (typeof processes)[number], socket: Socket) =>
        tracing !== null &&
        (socket.end.kind === 'store'
            ? tracing.stores.has(socket.end.id)
            : tracing.stores.has(socket.current) &&
              (tracing.stores.has(process.store) || socket.key === tracing.socket));

    if (!processes.some(process => whole(process) || near(process))) {
        return null;
    }

    const rowHeight = (touch ? 44 : 28) * unit;
    const laid = processes.flatMap((process, index) => {
        if (!whole(process) && !near(process)) {
            return [];
        }

        const frame = boxOf(process);
        const z = behindWindow(index);
        const inputs = inputsFor(process.program);
        const box = process.program === 'box' ? boxes.get(process.store) : undefined;
        const owned = HOLDING[process.program] !== null && process.program !== 'box';
        const choices = inputGroups(process, inputs, processes, stores, signals, loops, true);
        const names = [...new Set(choices.map(group => group.input))];
        const groupOf = (name: string) => {
            const definition = definitionOf(inputs, name);

            return definition === undefined || definition.from === 'own' ? null : definition.group;
        };
        const membersOf = (group: string) => names.filter(name => groupOf(name) === group);
        const open = openGroupIn(session, process.id);

        const folded = process.folded === true;
        const bundled: Row[] =
            names.length === 0
                ? []
                : [
                      {
                          kind: 'group',
                          key: groupKey(process.id, 'inputs'),
                          title: 'inputs',
                          members: names,
                      },
                  ];
        const rows = folded
            ? bundled
            : names.flatMap((name): Row[] => {
                  const group = groupOf(name);

                  if (group === null || membersOf(group).length < 2) {
                      return [{ kind: 'input', name, group: null }];
                  }

                  const key = groupKey(process.id, group);

                  return membersOf(group)[0] !== name
                      ? []
                      : [
                            { kind: 'group', key, title: group, members: membersOf(group) },
                            ...(open === key
                                ? membersOf(group).map((member): Row => ({
                                      kind: 'input',
                                      name: member,
                                      group: key,
                                  }))
                                : []),
                        ];
              });
        const pitch = rowHeight + 2 * unit;
        const clearance = (touch ? 56 : 40) * unit;
        const width = TAB_WIDTH * unit;
        const rowAt = (row: number) =>
            folded ? frame.y + (frame.height - rowHeight) / 2 : frame.y + clearance + row * pitch;
        const menu = { above: false, height: 160 * unit };
        const inputAt = (index: number) => ({
            x: frame.x - width - (REACH - 10) * unit,
            y: rowAt(index),
        });
        const outputAt = (index: number) => ({
            x: frame.x + frame.width + (REACH - 10) * unit,
            y: rowAt(index),
        });
        const output: Socket[] = !owned
            ? []
            : [
                  {
                      key: `${process.id}:output`,
                      window: process.id,
                      z,
                      side: 'right',
                      ...outputAt(0),
                      width,
                      menu,
                      title: 'Output',
                      type: madeBy(process.program),
                      colour: colourOf(process.store),
                      end: {
                          kind: 'store',
                          id: process.store,
                          program: process.program,
                          feeds:
                              SOURCES.find(source => source.program === process.program)?.kind ??
                              null,
                      },
                      receiver: {
                          kind: 'own',
                          window: process.id,
                          program: process.program,
                          store: process.store,
                      },
                      current: process.store,
                      optional: false,
                      options: withMain(process.program, stores).map(store => ({
                          ...store,
                          colour: colourOf(store.id),
                          source: '',
                          via: null,
                          hint: '',
                      })),
                      span: UNIT_SPAN,
                      group: null,
                      hidden: false,
                  },
              ];
        const inputSocket = (
            name: string,
            group: string | null,
            at: { x: number; y: number },
            choices: ReturnType<typeof inputGroups>,
            inputs: ReturnType<InputsFor>,
            store: string,
            key: string,
            label?: string,
        ) => {
            const options = choices.filter(choice => choice.input === name);
            const definition = definitionOf(inputs, name);
            const onStore = definition?.from === 'store';
            const current = options
                .flatMap(choice => choice.options)
                .find(option => option.current);
            const indent = group === null ? 0 : INDENT * unit;

            return {
                key: `${process.id}:input:${key}`,
                window: process.id,
                z,
                side: 'left',
                x: at.x - indent,
                y: at.y,
                width: width - indent,
                menu,
                title: label ?? options[0]?.label ?? name,
                type: definition?.takes ?? null,
                colour: current?.colour ?? 'var(--muted)',
                end: {
                    kind: 'port',
                    owner: onStore ? 'store' : 'window',
                    sink: onStore ? store : process.id,
                    input: definition?.from === 'store' ? definition.param : name,
                    accepts: options
                        .filter(choice => choice.via === null)
                        .map(choice => choice.source),
                    cuttable: options[0]?.optional === true,
                },
                receiver: null,
                current: current?.id ?? '',
                optional: options[0]?.optional === true,
                options: options
                    .flatMap(choice => choice.options.map(option => ({ choice, option })))
                    .sort((a, b) => Number(b.option.current) - Number(a.option.current))
                    .map(({ choice, option }) => ({
                        ...option,
                        name: options.length > 1 ? `${choice.title} · ${option.name}` : option.name,
                        source: choice.source,
                        via: choice.via,
                        hint:
                            choice.via !== null && isConverterKind(choice.via)
                                ? (CONVERTERS[choice.via].choices[0]?.title ?? '')
                                : '',
                    })),
                span: spanOf(definition),
                group,
                hidden: false,
            } satisfies Socket;
        };
        const nameOf = (id: string) =>
            pinNames.get(id) || (stores.find(entry => entry.id === id)?.name ?? id);
        const pinSockets = ({ inputs: pinsIn, outputs: pinsOut }: Box): Socket[] => [
            ...pinsIn.flatMap((pin, index) => {
                const draft: Draft = { ...process, program: 'pin-in', store: pin };

                if (!ownsInputs(inputsFor)(draft)) {
                    return [];
                }

                const pinInputs = inputsFor('pin-in');
                const choices = inputGroups(draft, pinInputs, processes, stores, signals, loops);

                return [
                    inputSocket(
                        'in',
                        null,
                        inputAt(rows.length + index),
                        choices,
                        pinInputs,
                        pin,
                        pin,
                        nameOf(pin),
                    ),
                ];
            }),
            ...pinsOut.map((pin, index): Socket => ({
                key: `${process.id}:output:${pin}`,
                window: process.id,
                z,
                side: 'right',
                ...outputAt(output.length + index),
                width,
                menu,
                title: nameOf(pin),
                type: 'bit',
                colour: colourOf(pin),
                end: { kind: 'store', id: pin, program: 'pin-out', feeds: 'pin-out' },
                receiver: null,
                current: pin,
                optional: false,
                options: [
                    {
                        id: pin,
                        name: nameOf(pin),
                        colour: colourOf(pin),
                        source: '',
                        via: null,
                        hint: '',
                    },
                ],
                span: UNIT_SPAN,
                group: null,
                hidden: false,
            })),
        ];
        const socketOf = (name: string, group: string | null, at: { x: number; y: number }) =>
            inputSocket(name, group, at, choices, inputs, process.store, name);

        const placed = rows.map((row, index) => {
            const at = inputAt(index);

            if (row.kind === 'input') {
                return { sockets: [socketOf(row.name, row.group, at)], groups: [] };
            }

            const collapsed = folded || open !== row.key;
            // A closed group's members still exist, drawn at its jack, so wires into them land somewhere.
            const members = collapsed
                ? row.members.map(name => ({
                      ...socketOf(name, row.key, at),
                      x: at.x,
                      width,
                      hidden: true,
                  }))
                : [];
            const bound = row.members
                .map(name => socketOf(name, row.key, at))
                .filter(socket => socket.current !== '' && !(folded && socket.type === 'clock'));

            return {
                sockets: members,
                groups: [
                    {
                        key: row.key,
                        window: process.id,
                        z,
                        side: 'left',
                        x: at.x,
                        y: at.y,
                        width,
                        title: row.title,
                        open: !collapsed,
                        bound: bound.length,
                        total: row.members.length,
                        colour: bound[0]?.colour ?? 'var(--muted)',
                        members: row.members.map(name => `${process.id}:input:${name}`),
                        folded,
                    } satisfies GroupRow,
                ],
            };
        });

        const all = [
            ...output,
            ...placed.flatMap(entry => entry.sockets),
            ...(box === undefined
                ? []
                : pinSockets(box).map(socket =>
                      folded && socket.side === 'left' ? { ...socket, hidden: true } : socket,
                  )),
        ];
        const kept = whole(process)
            ? all
            : all.filter(socket =>
                  tracing !== null
                      ? onPath(process, socket)
                      : socket.end.kind === 'store'
                        ? sources.has(socket.end.id)
                        : socket.current === focused?.store,
              );
        const keys = new Set(kept.map(socket => socket.key));

        return [
            {
                sockets: kept,
                groups: placed
                    .flatMap(entry => entry.groups)
                    .filter(group => whole(process) || group.members.some(key => keys.has(key))),
            },
        ];
    });
    const sockets = laid.flatMap(entry => entry.sockets);
    const windowOf = new Map(sockets.map(socket => [socket.key, socket.window]));

    return {
        all: mode.active,
        unit,
        rowHeight,
        sockets,
        groups: laid.flatMap(entry => entry.groups),
        wires: wiresOf(sockets, unit, rowHeight, style).filter(
            wire =>
                mode.active ||
                tracing !== null ||
                windowOf.get(wire.from) === peeked ||
                windowOf.get(wire.to) === peeked,
        ),
    };
};
