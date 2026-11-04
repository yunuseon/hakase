import { inputGroups } from './input-connections.ts';
import { definitionOf, SOURCES, type InputsFor } from './inputs.ts';
import { wiresOf, type Socket, type WiringView } from './components/state-wiring/wiring.ts';
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
    | { readonly kind: 'windows'; readonly ids: readonly string[] };

export type ModeSession = {
    readonly pinned: StateMode;
    readonly held: boolean;
    readonly locks: readonly string[];
};

export const defaultSession: ModeSession = { pinned: defaultMode, held: false, locks: [] };

export const reduceSession = (session: ModeSession, action: ModeAction): ModeSession => {
    switch (action.kind) {
        case 'close':
            return defaultSession;
        case 'windows':
            return {
                ...session,
                locks: session.locks.filter(
                    key => !key.startsWith('menu:') || action.ids.includes(key.slice(5)),
                ),
            };
        case 'blur':
            return { ...session, held: false, locks: [] };
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

const menuFor = (top: number, height: number, y: number) => {
    const below = top + height - 8 - (y + 28);
    const above = y - (top + 36);

    return { above: above > below, height: Math.max(24, Math.min(160, Math.max(above, below))) };
};

export const wiringOf = (
    workspace: Workspace,
    signals: ReadonlyMap<string, Signal>,
    inputsFor: InputsFor,
    mode: StateMode,
): WiringView | null => {
    if (!mode.active) {
        return null;
    }

    const { processes, stores } = workspace;
    const sockets = processes.flatMap((process): Socket[] => {
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
                      },
                  ];
        const groups = inputGroups(process, inputs, processes, stores, signals);
        const names = [...new Set(groups.map(group => group.input))];

        return [
            ...output,
            ...names.map((name, index): Socket => {
                const choices = groups.filter(group => group.input === name);
                const definition = definitionOf(inputs, name);
                const onStore = definition?.from === 'store';
                const current = choices
                    .flatMap(group => group.options)
                    .find(option => option.current);
                const y = rowAt(output.length + index);

                return {
                    key: `${process.id}:input:${name}`,
                    window: process.id,
                    x: frame.x + 8,
                    y,
                    width,
                    menu: menuFor(frame.y, frame.height, y),
                    title: choices[0]?.label ?? name,
                    colour: current?.colour ?? 'var(--muted)',
                    end: {
                        kind: 'port',
                        owner: onStore ? 'store' : 'window',
                        sink: onStore ? process.store : process.id,
                        input: definition?.from === 'store' ? definition.param : name,
                        accepts: choices.map(group => group.source),
                        cuttable: choices[0]?.optional === true,
                    },
                    receiver: null,
                    current: current?.id ?? '',
                    optional: choices[0]?.optional === true,
                    options: choices.flatMap(group =>
                        group.options.map(option => ({
                            ...option,
                            name:
                                choices.length > 1
                                    ? `${group.title} · ${option.name}`
                                    : option.name,
                            source: group.source,
                        })),
                    ),
                };
            }),
        ];
    });
    const origin = processes.find(process => process.id === mode.origin);

    return {
        sockets,
        wires: wiresOf(sockets),
        origin:
            origin === undefined
                ? null
                : { x: origin.frame.x + origin.frame.width - 70, y: origin.frame.y + 5 },
    };
};
