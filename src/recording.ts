import type { DocumentAction } from './documents.ts';
import type { AppSignal } from './protocol.ts';
import type { WorkspaceAction } from './workspace.ts';

export type Received =
    | { readonly kind: 'input'; readonly signal: AppSignal }
    | { readonly kind: 'document'; readonly action: DocumentAction }
    | { readonly kind: 'workspace'; readonly action: WorkspaceAction };

export type Heard = { readonly at: number; readonly received: readonly Received[] };

export type Recording = {
    readonly start: unknown;
    readonly wall: number;
    readonly turns: readonly Heard[];
};

export const recordingOf = (start: unknown, wall: number): Recording => ({
    start,
    wall,
    turns: [],
});

export const heard = (recording: Recording, turn: Heard): Recording => ({
    ...recording,
    turns: [...recording.turns, turn],
});

const numberOf = (value: number): string =>
    Number.isNaN(value)
        ? 'NaN'
        : value === Infinity
          ? 'Infinity'
          : value === -Infinity
            ? '-Infinity'
            : String(value);

const listOf = (items: readonly string[]): string => `[${items.join(', ')}]`;

export const literalOf = (value: unknown): string => {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
        return 'undefined';
    }
    if (value === null || typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return numberOf(value);
    if (typeof value === 'bigint') return `${value}n`;
    if (typeof value === 'string') return JSON.stringify(value);
    if (value instanceof Uint8Array) return `Uint8Array.from(${listOf([...value].map(String))})`;
    if (value instanceof Float32Array) {
        return `Float32Array.from(${listOf([...value].map(numberOf))})`;
    }
    if (value instanceof Map) {
        return `new Map(${listOf([...value].map(([key, item]) => listOf([literalOf(key), literalOf(item)])))})`;
    }
    if (value instanceof Set) return `new Set(${listOf([...value].map(literalOf))})`;
    if (Array.isArray(value)) return listOf(value.map(literalOf));

    return `{ ${Object.entries(value)
        .map(([key, item]) => `${JSON.stringify(key)}: ${literalOf(item)}`)
        .join(', ')} }`;
};

export const recordingSource = (recording: Recording): string =>
    [
        "import type { Recording } from '../recording.ts';",
        '',
        `export const recording = ${literalOf(recording)} satisfies Recording;`,
        '',
    ].join('\n');
