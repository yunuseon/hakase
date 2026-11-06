import { CATEGORIES, type Program } from './program.ts';
import type { ToolbarCategory } from './components/toolbar/toolbar.component.ts';

export const categoriesOf = (
    programs: readonly Pick<Program, 'id' | 'title' | 'icon' | 'category'>[],
): readonly ToolbarCategory[] =>
    CATEGORIES.map(category => ({
        ...category,
        items: programs
            .filter(program => program.category === category.id)
            .map(({ id, title, icon }) => ({ id, title, icon })),
    })).filter(category => category.items.length > 0);
