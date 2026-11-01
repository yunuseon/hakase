import { describe, expect, it } from 'vitest';
import { muxWebM, type VideoChunk } from './webm.ts';

const ID = {
    ebml: 0x1a45dfa3,
    docType: 0x4282,
    segment: 0x18538067,
    info: 0x1549a966,
    duration: 0x4489,
    cues: 0x1c53bb6b,
    cueTrackPositions: 0xb7,
    cueClusterPosition: 0xf1,
    cluster: 0x1f43b675,
    simpleBlock: 0xa3,
} as const;

type Element = { readonly id: number; readonly start: number; readonly end: number };

const vint = (
    bytes: Uint8Array,
    at: number,
    keepMarker: boolean,
): { value: number; length: number } => {
    const first = bytes[at] ?? 0;
    const length = Math.clz32(first) - 23;
    const head = keepMarker ? first : first & (0xff >> length);
    const value = Array.from(
        { length: length - 1 },
        (_, index) => bytes[at + 1 + index] ?? 0,
    ).reduce((total, byte) => total * 256 + byte, head);

    return { value, length };
};

const childrenOf = (
    bytes: Uint8Array,
    { start, end }: Pick<Element, 'start' | 'end'>,
): Element[] => {
    const found: Element[] = [];
    let at = start;

    while (at < end) {
        const id = vint(bytes, at, true);
        const size = vint(bytes, at + id.length, false);
        const body = at + id.length + size.length;
        found.push({ id: id.value, start: body, end: body + size.value });
        at = body + size.value;
    }

    return found;
};

const only = (elements: readonly Element[], id: number): Element => {
    const element = elements.find(candidate => candidate.id === id);

    if (element === undefined) {
        throw new Error(`no element 0x${id.toString(16)}`);
    }

    return element;
};

const uint = (bytes: Uint8Array, { start, end }: Element): number =>
    Array.from(bytes.slice(start, end)).reduce((total, byte) => total * 256 + byte, 0);

const chunk = (index: number, key: boolean): VideoChunk => ({
    data: Uint8Array.of(index, index, index),
    timestamp: Math.round((index * 1e6) / 30),
    key,
});

describe('muxWebM', () => {
    const chunks = Array.from({ length: 90 }, (_, index) => chunk(index, index % 60 === 0));
    const bytes = muxWebM({ codec: 'V_VP9', width: 320, height: 240, fps: 30, chunks });
    const top = childrenOf(bytes, { start: 0, end: bytes.length });
    const segment = only(top, ID.segment);
    const parts = childrenOf(bytes, segment);

    it('is a webm header and one segment that spans the rest of the file', () => {
        const docType = only(childrenOf(bytes, only(top, ID.ebml)), ID.docType);

        expect(new TextDecoder().decode(bytes.slice(docType.start, docType.end))).toBe('webm');
        expect(segment.end).toBe(bytes.length);
    });

    it('records the duration in milliseconds', () => {
        const duration = only(childrenOf(bytes, only(parts, ID.info)), ID.duration);

        expect(new DataView(bytes.buffer, duration.start, 8).getFloat64(0)).toBe(3000);
    });

    it('starts a cluster at every key frame, with every frame in one of them', () => {
        const clusters = parts.filter(({ id }) => id === ID.cluster);
        const blocks = clusters.flatMap(cluster =>
            childrenOf(bytes, cluster).filter(({ id }) => id === ID.simpleBlock),
        );

        expect(clusters).toHaveLength(2);
        expect(blocks).toHaveLength(90);
    });

    it('points each cue, counted from the segment data, at a cluster ID', () => {
        const positions = childrenOf(bytes, only(parts, ID.cues)).map(point =>
            uint(
                bytes,
                only(
                    childrenOf(bytes, only(childrenOf(bytes, point), ID.cueTrackPositions)),
                    ID.cueClusterPosition,
                ),
            ),
        );

        expect(positions).toHaveLength(2);
        expect(
            positions.map(position => vint(bytes, segment.start + position, true).value),
        ).toEqual([ID.cluster, ID.cluster]);
        expect(positions[0]).toBeLessThan(positions[1] ?? 0);
    });
});
