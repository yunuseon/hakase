import type { Observable } from 'rxjs';
import type { Image } from './image.ts';

export type Storage = {
    readonly read: (key: string) => unknown;
    readonly write: (key: string, value: unknown) => void;
};

export type Ports = {
    readonly frames$: Observable<number>;
    readonly wall$: Observable<number>;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly storage: Storage;
    readonly now: () => number;
};

export type PictureFrames = (
    image$: Observable<Image>,
    seconds$: Observable<number>,
) => Observable<readonly Uint8Array[] | null>;
