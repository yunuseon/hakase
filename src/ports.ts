import type { Observable } from 'rxjs';

export type Storage = {
    readonly read: (key: string) => unknown;
    readonly write: (key: string, value: unknown) => void;
};

export type Ports = {
    readonly frames$: Observable<number>;
    readonly wall$: Observable<number>;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly storage: Storage;
};
