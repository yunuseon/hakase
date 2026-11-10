import { describe, expectTypeOf, it } from 'vitest';
import type { AgendaBinding, TicketsBinding, FocusBinding, PlaybackBinding } from './inputs.ts';
import type { Process } from './workspace.ts';

type Of<P extends Process['program']> = Extract<Process, { program: P }>;

describe('Process', () => {
    it('gives each program the follows its own inputs declare, keyed by input', () => {
        expectTypeOf<Of<'sketch'>['follows']>().toEqualTypeOf<{
            readonly playback: PlaybackBinding;
        }>();
        expectTypeOf<Of<'playhead'>['follows']>().toEqualTypeOf<{
            readonly progress: PlaybackBinding;
        }>();
        expectTypeOf<Of<'progress'>['follows']>().toEqualTypeOf<{
            readonly source: FocusBinding | AgendaBinding | TicketsBinding;
        }>();
    });

    it('lets no other program follow anything', () => {
        expectTypeOf<keyof Of<'timeline'>['follows']>().toEqualTypeOf<never>();
        expectTypeOf<keyof Of<'tickets'>['follows']>().toEqualTypeOf<never>();
        expectTypeOf<
            keyof Exclude<Process, { program: 'sketch' | 'playhead' | 'progress' }>['follows']
        >().toEqualTypeOf<never>();
    });

    it('never lets a sketch hold a focus binding', () => {
        expectTypeOf<FocusBinding>().not.toExtend<Of<'sketch'>['follows']['playback']>();
    });
});
