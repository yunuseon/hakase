# Stores: shared or separate state, per window

## Idea

Every program's state lives in **named stores**, and every process is **bound** to
one store of its own program. Two windows bound to the same store share state;
a window bound to a store no other window uses has its own. "Shared document"
and "per-window settings" stop being two mechanisms: they are the same one with
a different default binding at launch.

## Model (workspace, program layer)

- `Workspace.stores: StoreEntry[]`, each `{ id, program, name, copy }`, plus a
  monotone `Workspace.made` counter for store ids (`store-<n>`), like `launched`.
  `copy` is the store it was split off from, or null.
- `Process.store: StoreId`.
- `HOLDING` (in `stores.ts`) says, per program, what its store holds and what a
  new window binds to. A program with a **document** (todo, board, notes, focus,
  agenda, habits, clocks, bookmarks) binds the document and shares the main
  store, whose id is the program id; its window settings (which note, which day)
  stay per window. A program with only **settings** (sketch, formula and theme
  editors) binds those settings, and each new window gets a fresh store. Timeline,
  playhead, tasks and appearance hold nothing of their own: no store, no chip.
- Actions: `bind-store`, `add-store` (new or split off with a copy, binding the
  window that asked), `rename-store`, `remove-store` (only one no window uses).
  All are undoable steps.
- Which windows share a store is **derived**, never stored. A store's colour is
  derived from its id.
- Migration: a saved process without `store` gets its program's default store
  if the program is shared, otherwise a store whose id is its own process id, so
  its existing settings carry over unchanged.

## Folds (main.ts)

- Every per-program document fold becomes a `Map<StoreId, State>`, and every
  input a process emits is stamped with its store in `liveProcess$`, beside
  `from`. Settings are keyed by store instead of by process.
- The focus timer folds a map of timers, and its ticks advance every running one.
- Splitting off a copy: new stores with `copy` are read off the workspace fold
  (`pairwise`) and fed to every document fold as a `copy` input, which copies
  only into a store that has no content yet, so undo/redo cannot clobber.
- **Programs do not learn about stores.** `liveProcess$` gives each program an
  `AppState` already narrowed to its binding:
  `binding$.pipe(switchMap(store => board$(store)))`. Rebinding swaps the stream;
  components already update in place by id.
- Global things stay global: playhead, transport, duration, look, formulas,
  themes, library, tasks.
- Persistence: each document is saved as a map by store; only stores that still
  exist in the workspace are written. An old single document becomes the
  program's default store.

## Window chip (component layer)

- `hks-window` gets a chip left of the close button: the store's colour dot and
  name. Clicking opens a popover: the program's stores with the windows using
  each, **New empty**, **Split off with a copy**, rename of the current store,
  and delete for unused ones.
- The window still knows nothing about stores: it receives plain options
  (`{ id, name, colour, users, current }`) and emits plain gestures, which
  `liveProcess$` stamps with the process id and program.
- The popover is closed by default and takes no pointer events while closed.

## Steps (one commit each)

1. Stores and bindings in the workspace, with migration and tests.
2. Per-store folds, scoped `AppState`, settings by store, copies, persistence.
3. The title-bar chip and popover.
4. Docs in CLAUDE.md; verify sharing and splitting with bookmarks and sketches.
