import { defer, EMPTY, merge } from 'rxjs';
import './styles.css';
import { browserPorts } from './browser-ports.ts';
import { chime$ } from './chime.ts';
import { console$ } from './console-client.ts';
import { coreOf } from './core.ts';
import { diagnosticsOf } from './graph/diagnostics.graph.ts';
import { rewrites$ } from './rewrites.ts';
import { scopedOf } from './graph/app-state.graph.ts';
import { pictureFrames$ } from './engine/levels.ts';
import { connectChrome$, mountChrome } from './graph/chrome.graph.ts';
import { documentActions$ } from './graph/document-actions.graph.ts';
import { intentsOf } from './graph/intents.graph.ts';
import { navigationOf } from './graph/navigation.graph.ts';
import { selectionOf } from './graph/selection.graph.ts';
import { stateModeOf } from './graph/state-mode.graph.ts';
import { previewsOf } from './graph/previews.graph.ts';
import { windowsOf } from './graph/windows.graph.ts';
import { soundOf } from './graph/sound.graph.ts';
import { sound$ } from './sound.ts';
import { workspaceActions$ } from './graph/workspace-actions.graph.ts';

const bootstrap = () => {
    const chrome = mountChrome();
    const intents = intentsOf(chrome);

    // The cycle: windows open from the history their own output folds. Every back edge is read lazily, here and nowhere else.
    const signals$ = defer(() => windows.signals$);
    const inputs$ = defer(() => windows.inputs$);
    const ports = browserPorts();
    const core = coreOf({
        ports,
        inputs$,
        workspaceActions$: defer(() => workspaceActions),
        documentActions$: defer(() => documentActions),
        pictureFrames$,
    });

    const selection = selectionOf({ ...chrome, ...intents, ...core, signals$, inputs$ });
    const navigation = navigationOf({ ...chrome, ...intents, ...core, ...selection, inputs$ });
    const stateMode = stateModeOf({ ...chrome, ...core, signals$ });
    const previews = previewsOf({ ...chrome, ...stateMode, ...core });
    const sound = soundOf({ ...chrome, inputs$ });
    const scoped = scopedOf({
        ...core,
        ...sound,
        inputs$,
        report$: defer(() => diagnostics.report$),
    });
    const windows = windowsOf({ ...chrome, ...core, ...selection, ...stateMode, scoped });
    const diagnostics = diagnosticsOf(
        { ...core.watched, windows: windows.signals$, rewrites: rewrites$(document.body) },
        ports,
    );

    const workspaceActions = workspaceActions$({
        ...chrome,
        ...intents,
        ...core,
        ...selection,
        ...navigation,
        ...stateMode,
        signals$,
        inputs$,
    });
    const documentActions = documentActions$({
        ...intents,
        ...core,
        ...selection,
        ...stateMode,
    });

    return merge(
        chime$(core.timers$, core.plans$),
        sound$(core, sound.listening$, sound.soloed$),
        core.persisted$,
        import.meta.env.DEV ? console$(diagnostics, core.history$) : EMPTY,
        connectChrome$({
            ...chrome,
            ...intents,
            ...core,
            ...selection,
            ...stateMode,
            ...previews,
            ...sound,
        }),
    ).subscribe();
};

bootstrap();
