import type { Rect } from '../../shared/camera.ts';

export type LinkKind = 'input' | 'output' | 'shared';

export type LinkView = {
    readonly from: Rect;
    readonly to: Rect;
    readonly kind: LinkKind;
    readonly colour: string;
};

const PULL = 0.5;
const MIN_PULL = 60;

export const linkPath = (from: Rect, to: Rect) => {
    const dx = to.x + to.width / 2 - (from.x + from.width / 2);
    const dy = to.y + to.height / 2 - (from.y + from.height / 2);

    if (Math.abs(dx) >= Math.abs(dy)) {
        const right = dx >= 0;
        const start = { x: right ? from.x + from.width : from.x, y: from.y + from.height / 2 };
        const end = { x: right ? to.x : to.x + to.width, y: to.y + to.height / 2 };
        const pull = Math.max(MIN_PULL, Math.abs(end.x - start.x) * PULL) * (right ? 1 : -1);

        return `M${start.x} ${start.y} C${start.x + pull} ${start.y} ${end.x - pull} ${end.y} ${end.x} ${end.y}`;
    }

    const down = dy >= 0;
    const start = { x: from.x + from.width / 2, y: down ? from.y + from.height : from.y };
    const end = { x: to.x + to.width / 2, y: down ? to.y : to.y + to.height };
    const pull = Math.max(MIN_PULL, Math.abs(end.y - start.y) * PULL) * (down ? 1 : -1);

    return `M${start.x} ${start.y} C${start.x} ${start.y + pull} ${end.x} ${end.y - pull} ${end.x} ${end.y}`;
};
