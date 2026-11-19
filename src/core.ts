import { merge, type Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { inputsFor } from './declarations.ts';
import type { DocumentAction } from './documents.ts';
import { begunFrom, historyOf } from './graph/history.graph.ts';
import { levelsOf } from './graph/levels.graph.ts';
import { mixOf } from './graph/mix.graph.ts';
import { persisted$ } from './graph/persistence.graph.ts';
import { projectionsOf } from './graph/projections.graph.ts';
import { timekeepingOf } from './graph/timekeeping.graph.ts';
import { documentActionsOf } from './input-actions.ts';
import type { PictureFrames, Ports } from './ports.ts';
import type { AppSignal } from './protocol.ts';
import { restoreState } from './state-store.ts';
import type { WorkspaceAction } from './workspace.ts';

type Drives = {
    readonly ports: Ports;
    readonly inputs$: Observable<AppSignal>;
    readonly documentActions$: Observable<DocumentAction>;
    readonly workspaceActions$: Observable<WorkspaceAction>;
    readonly pictureFrames$: PictureFrames;
};

export const coreOf = ({
    ports,
    inputs$,
    documentActions$,
    workspaceActions$,
    pictureFrames$,
}: Drives) => {
    const stored = restoreState(inputsFor, ports.storage);
    const history$ = historyOf(
        begunFrom(stored, ports.viewport),
        workspaceActions$,
        merge(documentActions$, inputs$.pipe(mergeMap(documentActionsOf))),
        inputs$,
    );
    const projected = projectionsOf(history$);
    const timekeeping = timekeepingOf({ ...projected, stored, inputs$, ports });
    const levels = levelsOf({ ...projected, ...timekeeping, pictureFrames$, ports });
    const mix = mixOf({ ...projected, ...timekeeping, ...levels });

    return {
        ...projected,
        ...timekeeping,
        ...levels,
        ...mix,
        persisted$: persisted$({ ...projected, ...timekeeping, ports }),
    };
};

export type Core = ReturnType<typeof coreOf>;
