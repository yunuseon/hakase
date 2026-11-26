import { animationFrames } from 'rxjs';
import { map } from 'rxjs/operators';
import { viewportSize } from './lib/dom.ts';
import { wallClock$ } from './lib/rx.ts';
import { readStored, writeStored } from './lib/storage.ts';
import type { Ports } from './ports.ts';

export const browserPorts = (): Ports => ({
    frames$: animationFrames().pipe(map(({ timestamp }) => timestamp)),
    wall$: wallClock$,
    viewport: viewportSize(),
    storage: { read: readStored, write: writeStored },
    now: () => performance.now(),
});
