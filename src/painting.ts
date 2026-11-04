import { MAX_BRUSH, type PaintEvent } from './components/paint/paint.ts';
import { clamp } from './lib/math.ts';
import type { AppInput } from './program.ts';
import type { PaintSettings } from './settings.ts';
import type { Picture } from './shared/picture.ts';

export const workingFrame = ({ frame }: PaintSettings, { frames }: Picture) =>
    clamp(Math.round(frame), 0, frames.length - 1);

export const paintInputsOf = (
    event: PaintEvent,
    settings: PaintSettings,
    picture: Picture,
): AppInput[] => {
    const frame = workingFrame(settings, picture);
    const count = picture.frames.length;
    const set = (next: PaintSettings): AppInput[] => [{ kind: 'settings', settings: next }];

    switch (event.kind) {
        case 'tool':
            return set({ ...settings, tool: event.tool });
        case 'brush':
            return set({ ...settings, [event.field]: event.value });
        case 'grow':
            return set({ ...settings, size: clamp(settings.size + event.by, 1, MAX_BRUSH) });
        case 'symmetry':
            return set({ ...settings, symmetry: event.symmetry });
        case 'select':
            return set({ ...settings, frame: clamp(Math.round(event.frame), 0, count - 1) });
        case 'step-frame':
            return set({ ...settings, frame: (frame + event.by + count) % count });
        case 'onion':
            return set({ ...settings, onion: !settings.onion });
        case 'stroke': {
            const { tool, size, hardness, flow, symmetry } = settings;

            if (tool === 'fill') {
                return event.start
                    ? [
                          {
                              kind: 'paint',
                              command: {
                                  kind: 'fill',
                                  frame,
                                  at: event.to,
                                  erase: false,
                                  symmetry,
                              },
                          },
                      ]
                    : [];
            }

            return [
                {
                    kind: 'paint',
                    command: {
                        kind: 'stroke',
                        frame,
                        from: event.from,
                        to: event.to,
                        brush: { tool, size, hardness, flow },
                        symmetry,
                        start: event.start,
                    },
                },
            ];
        }
        case 'action':
            return [{ kind: 'paint', command: { kind: event.action, frame } }];
        case 'shift':
            return [
                { kind: 'paint', command: { kind: 'shift', frame, dx: event.dx, dy: event.dy } },
            ];
        case 'side':
            return [{ kind: 'paint', command: { kind: 'resize', side: event.side } }];
        case 'add-frame':
            return [
                { kind: 'paint', command: { kind: 'add-frame', after: frame, copy: true } },
                ...set({ ...settings, frame: frame + 1 }),
            ];
        case 'remove-frame':
            return count <= 1
                ? []
                : [
                      { kind: 'paint', command: { kind: 'remove-frame', index: frame } },
                      ...set({ ...settings, frame: Math.max(0, frame - 1) }),
                  ];
        case 'fade':
            return [{ kind: 'paint', command: { kind: 'fade', fade: !picture.fade } }];
    }
};
