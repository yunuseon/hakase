import { describe, expectTypeOf, it } from 'vitest';
import type { FocusBinding, PaintBinding, PlaybackBinding, SignalBinding } from './inputs.ts';
import type { Process } from './workspace.ts';

type Of<P extends Process['program']> = Extract<Process, { program: P }>;

describe('Process', () => {
    it('gives each program the follows its own inputs declare, keyed by input', () => {
        expectTypeOf<Of<'sketch'>['follows']>().toEqualTypeOf<{
            readonly playback: PlaybackBinding;
            readonly k1?: SignalBinding;
            readonly k2?: SignalBinding;
            readonly k3?: SignalBinding;
            readonly k4?: SignalBinding;
            readonly turn?: SignalBinding;
            readonly pitch?: SignalBinding;
            readonly distance?: SignalBinding;
            readonly focus?: SignalBinding;
            readonly colour?: SignalBinding;
            readonly size?: SignalBinding;
            readonly depth?: SignalBinding;
            readonly trails?: SignalBinding;
            readonly paint?: PaintBinding;
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
