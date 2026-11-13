import { isGateKind } from './gates.ts';
import { isConverterKind } from './converters.ts';
import { isPedalKind } from './pedals.ts';
import {
    converterInputs,
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
    loosePlaybackInput,
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
          : program === 'paint'
            ? { playback: playbackInput }
            : program === 'voice'
              ? { playback: playbackInput, ...voiceInputs }
              : program === 'drums'
                ? { playback: playbackInput, ...drumsInputs }
                : isGateKind(program)
                  ? { playback: loosePlaybackInput, ...gateInputs(program) }
                  : isConverterKind(program)
                    ? { playback: playbackInput, ...converterInputs(program) }
                    : program === 'box'
                      ? { playback: loosePlaybackInput }
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
