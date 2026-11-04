import {
    knobInputs,
    plotInputs,
    signalInputs,
    sceneInputs,
    ownPlaybackInput,
    playbackInput,
    progressInput,
    type InputsFor,
} from './inputs.ts';

// What the program table declares, for tests: the programs themselves pull in the DOM.
export const inputsFor: InputsFor = program =>
    program === 'sketch'
        ? { playback: playbackInput, ...knobInputs, ...sceneInputs }
        : program === 'plot'
          ? { playback: playbackInput, ...plotInputs }
          : program === 'signal'
            ? { playback: playbackInput, ...signalInputs }
            : program === 'timeline'
              ? { playback: ownPlaybackInput }
              : program === 'playhead'
                ? { progress: progressInput }
                : {};
