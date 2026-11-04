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
import type { Signal } from './shared/signal.ts';
import { boxOf, type Workspace } from './workspace.ts';

export type StateMode = { readonly active: boolean; readonly origin: string | null };

export type ModeCommand =
    { readonly kind: 'enter'; readonly origin: string } | { readonly kind: 'toggle' | 'close' };

export const defaultMode: StateMode = { active: false, origin: null };

export const reduceMode = (mode: StateMode, command: ModeCommand): StateMode =>
    command.kind === 'enter'
        ? { active: true, origin: command.origin }
        : command.kind === 'close' || mode.active
          ? defaultMode
          : { active: true, origin: null };

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
    origin: pinned.origin,
});

const SOCKET_HEIGHT = 30;
const SOCKET_WIDTH = 180;
const INDENT = 14;

type Row =
    | { readonly kind: 'input'; readonly name: string; readonly group: string | null }
    | {
          readonly kind: 'group';
          readonly key: string;
          readonly title: string;
          readonly members: readonly string[];
      };

const menuFor = (top: number, height: number, y: number) => {
    const below = top + height - 8 - (y + 28);
    const above = y - (top + 36);

    return { above: above > below, height: Math.max(24, Math.min(160, Math.max(above, below))) };
};

const openGroupIn = ({ open, sprung }: ModeSession, window: string) =>
    sprung !== null && windowOfGroup(sprung) === window
        ? sprung
        : (open.find(key => windowOfGroup(key) === window) ?? null);

export const wiringOf = (
    workspace: Workspace,
    signals: ReadonlyMap<string, Signal>,
    inputsFor: InputsFor,
    session: ModeSession,
): WiringView | null => {
    const mode = modeOf(session);

    if (!mode.active) {
        return null;
    }

    const { processes, stores } = workspace;
    const laid = processes.map(process => {
        const frame = boxOf(process);
        const inputs = inputsFor(process.program);
        const width = Math.min(SOCKET_WIDTH, frame.width - 16);
        const rowAt = (row: number) => frame.y + 40 + row * SOCKET_HEIGHT;
        const output: Socket[] =
            HOLDING[process.program] === null
                ? []
                : [
                      {
                          key: `${process.id}:output`,
                          window: process.id,
                          x: frame.x + frame.width - width - 8,
                          y: rowAt(0),
                          width,
                          menu: menuFor(frame.y, frame.height, rowAt(0)),
                          title: 'Output',
                          colour: colourOf(process.store),
                          end: {
                              kind: 'store',
                              id: process.store,
                              program: process.program,
                              feeds:
                                  SOURCES.find(source => source.program === process.program)
                                      ?.kind ?? null,
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
        const choices = inputGroups(process, inputs, processes, stores, signals);
        const names = [...new Set(choices.map(group => group.input))];
        const groupOf = (name: string) => {
            const definition = definitionOf(inputs, name);

            return definition?.from === 'followed' ? definition.group : null;
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
        const rowOf = (index: number) => output.length + index;

        const socketOf = (name: string, group: string | null, at: { x: number; y: number }) => {
            const options = choices.filter(choice => choice.input === name);
            const definition = definitionOf(inputs, name);
            const onStore = definition?.from === 'store';
            const current = options
                .flatMap(choice => choice.options)
                .find(option => option.current);
            const indent = group === null ? 0 : INDENT;

            return {
                key: `${process.id}:input:${name}`,
                window: process.id,
                x: at.x + indent,
                y: at.y,
                width: width - indent,
                menu: menuFor(frame.y, frame.height, at.y),
                title: options[0]?.label ?? name,
                colour: current?.colour ?? 'var(--muted)',
                end: {
                    kind: 'port',
                    owner: onStore ? 'store' : 'window',
                    sink: onStore ? process.store : process.id,
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

        const placed = rows.map((row, index) => {
            const at = { x: frame.x + 8, y: rowAt(rowOf(index)) };

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
            sockets: [...output, ...placed.flatMap(entry => entry.sockets)],
            groups: placed.flatMap(entry => entry.groups),
        };
    });
    const sockets = laid.flatMap(entry => entry.sockets);
    const origin = processes.find(process => process.id === mode.origin);

    return {
        sockets,
        groups: laid.flatMap(entry => entry.groups),
        wires: wiresOf(sockets),
        origin:
            origin === undefined
                ? null
                : { x: origin.frame.x + origin.frame.width - 70, y: origin.frame.y + 5 },
    };
};
