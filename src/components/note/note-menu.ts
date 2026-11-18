import type { MenuGroup } from '../../shared/menu.ts';
import { ICONS } from '../../shared/ui/icons.ts';

export const noteMenu = (id: string | null): readonly MenuGroup[] =>
    id === null
        ? []
        : [
              {
                  id: 'note',
                  items: [
                      {
                          id: 'delete',
                          label: 'Delete this note',
                          glyph: ICONS.remove,
                          destructive: true,
                      },
                  ],
              },
          ];
