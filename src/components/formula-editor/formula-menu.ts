import type { MenuGroup } from '../../shared/menu.ts';
import { ICONS } from '../../shared/ui/icons.ts';

export const formulaMenu = ({
    deletable,
    copied,
}: {
    readonly deletable: boolean;
    readonly copied: boolean;
}): readonly MenuGroup[] => [
    {
        id: 'library',
        items: [
            {
                id: 'save',
                label: 'Save as new',
                glyph: ICONS.add,
                field: { placeholder: 'Save a copy as…' },
            },
            {
                id: 'share',
                label: copied ? 'Link copied' : 'Copy share link',
                glyph: copied ? ICONS.check : ICONS.link,
                hint: "a link that opens this formula in anyone's hakase",
            },
        ],
    },
    ...(deletable
        ? [
              {
                  id: 'remove',
                  items: [
                      {
                          id: 'delete',
                          label: 'Delete this formula',
                          glyph: ICONS.remove,
                          destructive: true,
                      },
                  ],
              },
          ]
        : []),
];
