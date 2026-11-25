import { combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { valuesOf } from '../protocol.ts';
import { persistState$ } from '../state-store.ts';
import type { Projections } from './projections.graph.ts';
import type { Ports } from '../ports.ts';
import type { Timekeeping } from './timekeeping.graph.ts';

type Saved = Pick<
    Projections,
    | 'history$'
    | 'workspace$'
    | 'look$'
    | 'aspect$'
    | 'wires$'
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
    | 'scenes$'
    | 'voices$'
    | 'drums$'
    | 'pedals$'
    | 'gates$'
    | 'converters$'
    | 'boxes$'
    | 'focusLinks$'
    | 'sketchLinks$'
    | 'library$'
    | 'blueprints$'
> &
    Pick<Timekeeping, 'timersRested$' | 'playbacksRested$'> & {
        readonly ports: Pick<Ports, 'storage'>;
    };

export const persisted$ = ({
    history$,
    workspace$,
    look$,
    aspect$,
    wires$,
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
    scenes$,
    voices$,
    drums$,
    pedals$,
    gates$,
    converters$,
    boxes$,
    focusLinks$,
    sketchLinks$,
    library$,
    blueprints$,
    timersRested$,
    playbacksRested$,
    ports: { storage },
}: Saved) =>
    persistState$(
        combineLatest({
            workspace: workspace$,
            look: look$,
            aspect: aspect$,
            wires: wires$,
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
            scenes: scenes$,
            voices: voices$,
            drums: drums$,
            pedals: pedals$,
            gates: gates$,
            converters: converters$,
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
        storage,
    );
