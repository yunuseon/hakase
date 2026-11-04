import { describe, expectTypeOf, it } from 'vitest';
import type {
    FocusBinding,
    PaintBinding,
    PenBinding,
    PlaybackBinding,
    SignalBinding,
    VoiceBinding,
} from './inputs.ts';
import type { Process } from './workspace.ts';

type Of<P extends Process['program']> = Extract<Process, { program: P }>;

describe('Process', () => {
    it('gives each program the follows its own inputs declare, keyed by input', () => {
        expectTypeOf<Of<'sketch'>['follows']>().toEqualTypeOf<{
            readonly playback: PlaybackBinding;
            readonly k1?: SignalBinding | VoiceBinding;
            readonly k2?: SignalBinding | VoiceBinding;
            readonly k3?: SignalBinding | VoiceBinding;
            readonly k4?: SignalBinding | VoiceBinding;
            readonly turn?: SignalBinding | VoiceBinding;
            readonly pitch?: SignalBinding | VoiceBinding;
            readonly distance?: SignalBinding | VoiceBinding;
            readonly focus?: SignalBinding | VoiceBinding;
            readonly colour?: SignalBinding | VoiceBinding;
            readonly size?: SignalBinding | VoiceBinding;
            readonly depth?: SignalBinding | VoiceBinding;
            readonly trails?: SignalBinding | VoiceBinding;
            readonly paint?: PaintBinding | PenBinding;
        }>();
        expectTypeOf<Of<'playhead'>['follows']>().toEqualTypeOf<{
            readonly progress: PlaybackBinding | FocusBinding;
        }>();
    });

    it('lets no other program follow anything', () => {
        expectTypeOf<keyof Of<'timeline'>['follows']>().toEqualTypeOf<never>();
        expectTypeOf<keyof Of<'todo'>['follows']>().toEqualTypeOf<never>();
        expectTypeOf<
            keyof Exclude<Process, { program: 'sketch' | 'playhead' }>['follows']
        >().toEqualTypeOf<never>();
    });

    it('never lets a sketch hold a focus binding', () => {
        expectTypeOf<FocusBinding>().not.toExtend<Of<'sketch'>['follows']['playback']>();
    });
});
