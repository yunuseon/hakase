import { describe, expectTypeOf, it } from 'vitest';
import type { FocusBinding, Follow, PlaybackBinding } from './inputs.ts';
import type { Process } from './workspace.ts';

type Of<P extends Process['program']> = Extract<Process, { program: P }>;

describe('Process', () => {
    it('gives each program the follows its own inputs declare, keyed by input', () => {
        expectTypeOf<Of<'sketch'>['follows']>().toEqualTypeOf<{
            readonly playback: PlaybackBinding;
        }>();
        expectTypeOf<Of<'playhead'>['follows']>().toEqualTypeOf<{ readonly progress: Follow }>();
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
