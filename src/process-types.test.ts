import { describe, expectTypeOf, it } from 'vitest';
import type {
    FocusBinding,
    PaintBinding,
    PenBinding,
    PlaybackBinding,
    SignalBinding,
    VoiceBinding,
    DrumsBinding,
} from './inputs.ts';
import type { Process } from './workspace.ts';

type Of<P extends Process['program']> = Extract<Process, { program: P }>;

describe('Process', () => {
    it('gives each program the follows its own inputs declare, keyed by input', () => {
        expectTypeOf<Of<'sketch'>['follows']>().toEqualTypeOf<{
            readonly playback: PlaybackBinding;
            readonly k1?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly k2?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly k3?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly k4?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly turn?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly pitch?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly distance?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly focus?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly colour?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly size?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly depth?: SignalBinding | VoiceBinding | DrumsBinding;
            readonly trails?: SignalBinding | VoiceBinding | DrumsBinding;
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
