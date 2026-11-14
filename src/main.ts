import { defer, merge } from 'rxjs';
import './styles.css';
import { chime$ } from './chime.ts';
import { scopedOf } from './graph/app-state.graph.ts';
import { levelsOf } from './graph/levels.graph.ts';
import { connectChrome$, mountChrome } from './graph/chrome.graph.ts';
import { documentActions$ } from './graph/document-actions.graph.ts';
import { begunFrom, historyOf } from './graph/history.graph.ts';
import { intentsOf } from './graph/intents.graph.ts';
import { navigationOf } from './graph/navigation.graph.ts';
import { persisted$ } from './graph/persistence.graph.ts';
import { projectionsOf } from './graph/projections.graph.ts';
import { selectionOf } from './graph/selection.graph.ts';
import { stateModeOf } from './graph/state-mode.graph.ts';
import { timekeepingOf } from './graph/timekeeping.graph.ts';
import { windowsOf } from './graph/windows.graph.ts';
import { workspaceActions$ } from './graph/workspace-actions.graph.ts';
import { inputsFor } from './programs.ts';
import { restoreState } from './state-store.ts';

const bootstrap = () => {
    const chrome = mountChrome();
    const intents = intentsOf(chrome);
    const stored = restoreState(inputsFor);

    // The cycle: windows open from the history their own output folds. Every back edge is read lazily, here and nowhere else.
    const signals$ = defer(() => windows.signals$);
    const inputs$ = defer(() => windows.inputs$);
    const history$ = historyOf(
        begunFrom(stored),
        defer(() => workspaceActions),
        defer(() => documentActions),
        inputs$,
    );

    const projected = projectionsOf(history$);
    const timekeeping = timekeepingOf({ ...projected, stored, inputs$ });
    const selection = selectionOf({
        ...chrome,
        ...intents,
        ...projected,
        ...timekeeping,
        signals$,
        inputs$,
    });
    const navigation = navigationOf({ ...chrome, ...intents, ...projected, inputs$ });
    const stateMode = stateModeOf({ ...chrome, ...projected, signals$ });
    const levels = levelsOf({ ...projected, ...timekeeping });
    const scoped = scopedOf({ ...projected, ...timekeeping, ...levels, inputs$ });
    const windows = windowsOf({ ...chrome, ...projected, ...selection, ...stateMode, scoped });

    const workspaceActions = workspaceActions$({
        ...chrome,
        ...intents,
        ...projected,
        ...selection,
        ...navigation,
        ...stateMode,
        signals$,
        inputs$,
    });
    const documentActions = documentActions$({
        ...intents,
        ...projected,
        ...selection,
        ...stateMode,
        inputs$,
    });

    return merge(
        chime$(timekeeping.timers$, timekeeping.plans$),
        persisted$({ ...projected, ...timekeeping }),
        connectChrome$({ ...chrome, ...intents, ...projected, ...selection, ...stateMode }),
    ).subscribe();
};

bootstrap();
