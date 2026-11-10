import { merge, type Observable } from 'rxjs';
import { map, mergeMap, scan, shareReplay, startWith } from 'rxjs/operators';
import {
    documentsKit,
    reduceHistory,
    seqFloor,
    type DocumentAction,
    type Documents,
    type History,
    type TimeCommand,
} from '../documents.ts';
import { viewportSize } from '../lib/dom.ts';
import type { AppSignal } from '../process.ts';
import { restored } from '../program.ts';
import { inputsFor } from '../programs.ts';
import type { Restored } from '../state-store.ts';
import { startTimeline } from '../timeline.ts';
import { defaultWorkspace, type WorkspaceAction } from '../workspace.ts';

const reduced = reduceHistory(documentsKit(inputsFor));

export const begunFrom = (stored: Restored): History => {
    const started: Documents = {
        workspace: stored.workspace ?? defaultWorkspace(viewportSize(), inputsFor),
        settings: stored.settings,
        tickets: stored.tickets,
        notes: stored.notes,
        agendas: stored.agenda,
        habits: stored.habits,
        clocks: stored.clocks,
        bookmarks: stored.bookmarks,
        signals: stored.signals,
        paintings: stored.paint,
        pens: stored.pens,
        voices: stored.voices,
        drums: stored.drums,
        pedals: stored.pedals,
        focusLinks: stored.focusLinks,
        sketchLinks: stored.sketchLinks,
        library: stored.library,
        blueprints: stored.blueprints,
        formulas: restored(stored.formulas),
        themes: restored(stored.themes),
        looks: restored(stored.looks),
        look: stored.look,
    };

    return startTimeline(started, Math.max(stored.seq, seqFloor(started)));
};

export const historyOf = (
    begun: History,
    workspaceActions$: Observable<WorkspaceAction>,
    documentActions$: Observable<DocumentAction>,
    inputs$: Observable<AppSignal>,
): Observable<History> =>
    merge(
        workspaceActions$.pipe(map((action): DocumentAction => ({ kind: 'workspace', action }))),
        documentActions$,
        inputs$.pipe(
            mergeMap(({ input }): TimeCommand[] =>
                input.kind === 'take-back' ? [{ kind: 'take-back', id: input.id }] : [],
            ),
        ),
    ).pipe(
        scan(
            (history: History, action: DocumentAction | TimeCommand) => reduced(history, action),
            begun,
        ),
        // Emitted into the replay buffer before the processes start and read it back.
        startWith(begun),
        // Not refCount: every document outlives the moment between two of its readers.
        shareReplay({ bufferSize: 1, refCount: false }),
    );
