import { concatBytes, offsetsOf } from './bytes.ts';

export type VideoChunk = {
    readonly data: Uint8Array;
    // Microseconds, as WebCodecs reports them.
    readonly timestamp: number;
    readonly key: boolean;
};

export type WebMVideo = {
    readonly codec: 'V_VP9' | 'V_VP8';
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly chunks: readonly VideoChunk[];
};

const bytesOf = (value: number, length: number): Uint8Array =>
    Uint8Array.from({ length }, (_, index) =>
        Number((BigInt(value) >> BigInt(8 * (length - 1 - index))) & 0xffn),
    );

const widthOf = (value: number): number => Math.max(1, Math.ceil(Math.log2(value + 1) / 8));

// A size is a variable-length integer: n bytes carry 7n bits, and the all-ones value means "unknown".
const sizeOf = (size: number): Uint8Array => {
    const length = [1, 2, 3, 4, 5, 6, 7, 8].find(n => size < 2 ** (7 * n) - 1) ?? 8;
    const bytes = bytesOf(size, length);
    bytes[0] = (bytes[0] ?? 0) | (1 << (8 - length));

    return bytes;
};

const idOf = (id: number): Uint8Array => bytesOf(id, widthOf(id));

const element = (id: number, payload: Uint8Array): Uint8Array =>
    concatBytes([idOf(id), sizeOf(payload.length), payload]);

const master = (id: number, children: readonly Uint8Array[]): Uint8Array =>
    element(id, concatBytes(children));

const uint = (id: number, value: number, length = widthOf(value)): Uint8Array =>
    element(id, bytesOf(value, length));

const float = (id: number, value: number): Uint8Array => {
    const payload = new Uint8Array(8);
    new DataView(payload.buffer).setFloat64(0, value);

    return element(id, payload);
};

const text = (id: number, value: string): Uint8Array =>
    element(id, new TextEncoder().encode(value));

const ID = {
    ebml: 0x1a45dfa3,
    ebmlVersion: 0x4286,
    ebmlReadVersion: 0x42f7,
    maxIdLength: 0x42f2,
    maxSizeLength: 0x42f3,
    docType: 0x4282,
    docTypeVersion: 0x4287,
    docTypeReadVersion: 0x4285,
    segment: 0x18538067,
    info: 0x1549a966,
    timecodeScale: 0x2ad7b1,
    duration: 0x4489,
    muxingApp: 0x4d80,
    writingApp: 0x5741,
    tracks: 0x1654ae6b,
    trackEntry: 0xae,
    trackNumber: 0xd7,
    trackUid: 0x73c5,
    trackType: 0x83,
    codecId: 0x86,
    defaultDuration: 0x23e383,
    video: 0xe0,
    pixelWidth: 0xb0,
    pixelHeight: 0xba,
    cues: 0x1c53bb6b,
    cuePoint: 0xbb,
    cueTime: 0xb3,
    cueTrackPositions: 0xb7,
    cueTrack: 0xf7,
    cueClusterPosition: 0xf1,
    cluster: 0x1f43b675,
    timecode: 0xe7,
    simpleBlock: 0xa3,
} as const;

const header = (): Uint8Array =>
    master(ID.ebml, [
        uint(ID.ebmlVersion, 1),
        uint(ID.ebmlReadVersion, 1),
        uint(ID.maxIdLength, 4),
        uint(ID.maxSizeLength, 8),
        text(ID.docType, 'webm'),
        uint(ID.docTypeVersion, 4),
        uint(ID.docTypeReadVersion, 2),
    ]);

const millis = (microseconds: number): number => Math.round(microseconds / 1000);

const block = (chunk: VideoChunk, clusterTime: number): Uint8Array => {
    const relative = new Uint8Array(2);
    new DataView(relative.buffer).setInt16(0, millis(chunk.timestamp) - clusterTime);

    return element(
        ID.simpleBlock,
        concatBytes([sizeOf(1), relative, Uint8Array.of(chunk.key ? 0x80 : 0), chunk.data]),
    );
};

// A cluster starts at every key frame, so each one is a place a player can seek to.
const clustersOf = (chunks: readonly VideoChunk[]): readonly (readonly VideoChunk[])[] =>
    chunks.reduce<readonly (readonly VideoChunk[])[]>((clusters, chunk) => {
        const last = clusters.at(-1);

        return chunk.key || last === undefined
            ? [...clusters, [chunk]]
            : [...clusters.slice(0, -1), [...last, chunk]];
    }, []);

// Cues go before the clusters, with fixed-width positions so their own size cannot move what they point at.
const POSITION_BYTES = 8;

export const muxWebM = ({
    codec,
    width,
    height,
    fps,
    chunks,
}: WebMVideo): Uint8Array<ArrayBuffer> => {
    const info = master(ID.info, [
        uint(ID.timecodeScale, 1_000_000),
        float(ID.duration, (chunks.length * 1000) / fps),
        text(ID.muxingApp, 'hakase'),
        text(ID.writingApp, 'hakase'),
    ]);

    const tracks = master(ID.tracks, [
        master(ID.trackEntry, [
            uint(ID.trackNumber, 1),
            uint(ID.trackUid, 1),
            uint(ID.trackType, 1),
            text(ID.codecId, codec),
            uint(ID.defaultDuration, Math.round(1e9 / fps)),
            master(ID.video, [uint(ID.pixelWidth, width), uint(ID.pixelHeight, height)]),
        ]),
    ]);

    const clusters = clustersOf(chunks).map(members => {
        const time = millis(members[0]?.timestamp ?? 0);

        return {
            time,
            bytes: master(ID.cluster, [
                uint(ID.timecode, time),
                ...members.map(chunk => block(chunk, time)),
            ]),
        };
    });

    const cuesFor = (positions: readonly number[]): Uint8Array =>
        master(
            ID.cues,
            clusters.map(({ time }, index) =>
                master(ID.cuePoint, [
                    uint(ID.cueTime, time),
                    master(ID.cueTrackPositions, [
                        uint(ID.cueTrack, 1),
                        uint(ID.cueClusterPosition, positions[index] ?? 0, POSITION_BYTES),
                    ]),
                ]),
            ),
        );

    const positions = offsetsOf(
        clusters.map(({ bytes }) => bytes.length),
        info.length + tracks.length + cuesFor([]).length,
    );

    return concatBytes([
        header(),
        master(ID.segment, [
            info,
            tracks,
            cuesFor(positions),
            ...clusters.map(({ bytes }) => bytes),
        ]),
    ]);
};
