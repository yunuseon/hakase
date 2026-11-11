import { isGateKind } from './gates.ts';
import { isPedalKind } from './pedals.ts';
import {
    knobInputs,
    paintInput,
    penInputs,
    voiceInputs,
    drumsInputs,
    focusInputs,
    plotInputs,
    signalInputs,
    sceneInputs,
    ownPlaybackInput,
    playbackInput,
    imageInput,
    pedalInputs,
    gateInputs,
    progressInput,
    sourceInput,
    type InputsFor,
} from './inputs.ts';

// What the program table declares, for tests: the programs themselves pull in the DOM.
export const inputsFor: InputsFor = program =>
    program === 'sketch'
        ? { playback: playbackInput, ...knobInputs, ...sceneInputs, paint: paintInput }
        : program === 'pen'
          ? { playback: playbackInput, ...penInputs }
          : program === 'voice'
            ? { playback: playbackInput, ...voiceInputs }
            : program === 'drums'
              ? { playback: playbackInput, ...drumsInputs }
              : isGateKind(program)
                ? { playback: playbackInput, ...gateInputs(program) }
                : isPedalKind(program)
                  ? { playback: playbackInput, ...pedalInputs(program) }
                  : program === 'output'
                    ? { playback: playbackInput, in: imageInput('in') }
                    : program === 'plot'
                      ? { playback: playbackInput, ...plotInputs }
                      : program === 'signal'
                        ? { playback: playbackInput, ...signalInputs }
                        : program === 'timeline'
                          ? { playback: ownPlaybackInput }
                          : program === 'playhead'
                            ? { progress: progressInput }
                            : program === 'progress'
                              ? { source: sourceInput }
                              : program === 'focus'
                                ? { ...focusInputs }
                                : {};
