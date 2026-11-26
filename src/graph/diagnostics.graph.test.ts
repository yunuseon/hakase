import { firstValueFrom, of } from 'rxjs';
import { take, toArray } from 'rxjs/operators';
import { describe, expect, it } from 'vitest';
import { turnsOf } from './diagnostics.graph.ts';

describe('turns', () => {
    it('gathers what is emitted while subscribing into the first turn', async () => {
        const turns = await firstValueFrom(
            turnsOf({ a: of(1, 2), b: of('x') }, () => 7).pipe(take(1), toArray()),
        );

        expect(turns).toEqual([
            {
                at: 7,
                pulses: [
                    { stream: 'a', at: 7, digest: '1' },
                    { stream: 'a', at: 7, digest: '2' },
                    { stream: 'b', at: 7, digest: '"x"' },
                ],
            },
        ]);
    });
});
