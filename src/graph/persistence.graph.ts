import { combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { valuesOf } from '../program.ts';
import { persistState$ } from '../state-store.ts';
import type { Projections } from './projections.graph.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

type Saved = Pick<
    Projections,
    | 'history$'
    | 'workspace$'
    | 'look$'
    | 'aspect$'
    | 'looks$'
    | 'edits$'
    | 'palettes$'
    | 'settings$'
    | 'tickets$'
    | 'notes$'
    | 'agendas$'
    | 'habits$'
    | 'clocks$'
    | 'bookmarks$'
    | 'waves$'
    | 'paintings$'
    | 'pens$'
    | 'voices$'
    | 'drums$'
    | 'pedals$'
    | 'gates$'
    | 'boxes$'
    | 'focusLinks$'
    | 'sketchLinks$'
    | 'library$'
    | 'blueprints$'
> &
    Pick<Timekeeping, 'timersRested$' | 'playbacksRested$'>;

export const persisted$ = ({
    history$,
    workspace$,
    look$,
    aspect$,
    looks$,
    edits$,
    palettes$,
    settings$,
    tickets$,
    notes$,
    agendas$,
    habits$,
    clocks$,
    bookmarks$,
    waves$,
    paintings$,
    pens$,
    voices$,
    drums$,
    pedals$,
    gates$,
    boxes$,
    focusLinks$,
    sketchLinks$,
    library$,
    blueprints$,
    timersRested$,
    playbacksRested$,
}: Saved) =>
    persistState$(
        combineLatest({
            workspace: workspace$,
            look: look$,
            aspect: aspect$,
            looks: looks$.pipe(map(valuesOf)),
            formulas: edits$.pipe(map(valuesOf)),
            themes: palettes$.pipe(map(valuesOf)),
            settings: settings$,
            tickets: tickets$,
            notes: notes$,
            focus: timersRested$,
            playback: playbacksRested$,
            agenda: agendas$,
            habits: habits$,
            clocks: clocks$,
            bookmarks: bookmarks$,
            signals: waves$,
            paint: paintings$,
            pens: pens$,
            voices: voices$,
            drums: drums$,
            pedals: pedals$,
            gates: gates$,
            boxes: boxes$,
            focusLinks: focusLinks$,
            sketchLinks: sketchLinks$,
            library: library$,
            blueprints: blueprints$,
            seq: history$.pipe(
                map(({ seq }) => seq),
                distinctUntilChanged(),
            ),
        }),
    );
