import { inputGroups } from './input-connections.ts';
import { definitionOf, SOURCES, type InputsFor } from './inputs.ts';
import {
    groupKey,
    windowOfGroup,
    wiresOf,
    type GroupRow,
    type Socket,
    type WiringView,
} from './components/state-wiring/wiring.ts';
import { colourOf, HOLDING, withMain } from './stores.ts';
import type { Linked } from './shared/signal.ts';
import type { Box } from './boxes.ts';
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
            return {
                ...session,
                locks: action.busy
                    ? [...new Set([...session.locks, action.key])]
                    : session.locks.filter(key => key !== action.key),
            };
        default:
            return { ...session, pinned: reduceMode(session.pinned, action) };
    }
};

export const modeOf = ({ pinned, held, locks }: ModeSession) => ({
    active: pinned.active || held || locks.length > 0,
});

const SOCKET_WIDTH = 180;
const INDENT = 14;
const EDGE_WIDTH = 120;

type Row =
    | { readonly kind: 'input'; readonly name: string; readonly group: string | null }
    | {
          readonly kind: 'group';
          readonly key: string;
          readonly title: string;
          readonly members: readonly string[];
      };

const menuFor = (top: number, height: number, y: number, unit: number, rowHeight: number) => {
    const below = top + height - 8 * unit - (y + rowHeight);
    const above = y - (top + 36 * unit);

    return {
        above: above > below,
        height: Math.max(24 * unit, Math.min(160 * unit, Math.max(above, below))),
    };
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
): WiringView | null => {
    const mode = modeOf(session);

    if (!mode.active) {
        return null;
    }

    const { processes, stores } = workspace;
    const rowHeight = (touch ? 44 : 28) * unit;
    const laid = processes.map(process => {
        const frame = boxOf(process);
        const inputs = inputsFor(process.program);
        const box = process.program === 'box' ? boxes.get(process.store) : undefined;
        const owned = HOLDING[process.program] !== null && process.program !== 'box';
        const choices = inputGroups(process, inputs, processes, stores, signals, loops);
        const names = [...new Set(choices.map(group => group.input))];
        const groupOf = (name: string) => {
            const definition = definitionOf(inputs, name);

            return definition === undefined || definition.from === 'own' ? null : definition.group;
        };
        const membersOf = (group: string) => names.filter(name => groupOf(name) === group);
        const open = openGroupIn(session, process.id);

        const rows = names.flatMap((name): Row[] => {
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
        const ins = rows.length + (box?.inputs.length ?? 0);
        const outs = (owned ? 1 : 0) + (box?.outputs.length ?? 0);
        const pitch = rowHeight + 2 * unit;
        const clearance = (touch ? 56 : 40) * unit;
        const inside =
            clearance + (ins + outs) * pitch + 8 * unit <= frame.height &&
            frame.width - 16 * unit >= EDGE_WIDTH * unit;
        const width = inside
            ? Math.min(SOCKET_WIDTH * unit, frame.width - 16 * unit)
            : EDGE_WIDTH * unit;
        const rowAt = (row: number) => frame.y + clearance + row * pitch;
        const column = (index: number, count: number) =>
            frame.y + frame.height / 2 - (count * pitch - 2 * unit) / 2 + index * pitch;
        const menuAt = (y: number) =>
            inside
                ? menuFor(frame.y, frame.height, y, unit, rowHeight)
                : { above: false, height: 160 * unit };
        const inputAt = (index: number) =>
            inside
                ? { x: frame.x + 8 * unit, y: rowAt((owned ? 1 : 0) + index) }
                : { x: frame.x - 10 * unit, y: column(index, ins) };
        const outputAt = (index: number) =>
            inside
                ? {
                      x: frame.x + frame.width - width - 8 * unit,
                      y: rowAt(owned && index === 0 ? 0 : ins + index),
                  }
                : { x: frame.x + frame.width + 10 * unit - width, y: column(index, outs) };
        const output: Socket[] = !owned
            ? []
            : [
                  {
                      key: `${process.id}:output`,
                      window: process.id,
                      ...outputAt(0),
                      width,
                      menu: menuAt(outputAt(0).y),
                      title: 'Output',
                      type:
                          SOURCES.find(source => source.program === process.program)?.makes ?? null,
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
                      })),
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
                x: at.x + indent,
                y: at.y,
                width: width - indent,
                menu: menuAt(at.y),
                title: label ?? options[0]?.label ?? name,
                type: definition?.takes ?? null,
                colour: current?.colour ?? 'var(--muted)',
                end: {
                    kind: 'port',
                    owner: onStore ? 'store' : 'window',
                    sink: onStore ? store : process.id,
                    input: definition?.from === 'store' ? definition.param : name,
                    accepts: options.map(choice => choice.source),
                    cuttable: options[0]?.optional === true,
                },
                receiver: null,
                current: current?.id ?? '',
                optional: options[0]?.optional === true,
                options: options.flatMap(choice =>
                    choice.options.map(option => ({
                        ...option,
                        name: options.length > 1 ? `${choice.title} · ${option.name}` : option.name,
                        source: choice.source,
                    })),
                ),
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
                ...outputAt(output.length + index),
                width,
                menu: menuAt(outputAt(output.length + index).y),
                title: nameOf(pin),
                type: 'bit',
                colour: colourOf(pin),
                end: { kind: 'store', id: pin, program: 'pin-out', feeds: 'pin-out' },
                receiver: null,
                current: pin,
                optional: false,
                options: [{ id: pin, name: nameOf(pin), colour: colourOf(pin), source: '' }],
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

            const collapsed = open !== row.key;
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
                .filter(socket => socket.current !== '');

            return {
                sockets: members,
                groups: [
                    {
                        key: row.key,
                        window: process.id,
                        x: at.x,
                        y: at.y,
                        width,
                        title: row.title,
                        open: !collapsed,
                        bound: bound.length,
                        total: row.members.length,
                        colour: bound[0]?.colour ?? 'var(--muted)',
                        members: row.members.map(name => `${process.id}:input:${name}`),
                    } satisfies GroupRow,
                ],
            };
        });

        return {
            sockets: [
                ...output,
                ...placed.flatMap(entry => entry.sockets),
                ...(box === undefined ? [] : pinSockets(box)),
            ],
            groups: placed.flatMap(entry => entry.groups),
        };
    });
    const sockets = laid.flatMap(entry => entry.sockets);

    return {
        unit,
        rowHeight,
        sockets,
        groups: laid.flatMap(entry => entry.groups),
        wires: wiresOf(sockets, unit, rowHeight),
    };
};
