# Design

Sprawniej looks like our internal tools (Punchcard): calm, dark, neutral grey, with roomy controls. Inside that
frame the issue screens are dense and quick: compact rows, clear status and priority icons, keyboard shortcuts for
everything common.

## Colours

All colours are CSS variables in `src/index.css`, on shadcn's zinc scale. Use the Tailwind names
(`bg-background`, `text-muted-foreground`, `border`…), never raw hex values in components.

| Use | Token | Value |
| --- | --- | --- |
| Page background | `background` | `#1c1c1f` |
| Sidebar | `sidebar` | `#161618` |
| Hover, selected item | `accent` | `#2a2a2e` |
| Lines and borders | `border` | `#2e2e33` |
| Text | `foreground` | `#f4f4f5` |
| Quiet text (labels, dates, IDs) | `muted-foreground` | `#a1a1aa` |
| Main button | `primary` | white with dark text |

Colour only means something. Status colours (`status-*`), the orange of Urgent, and label colours are the only
bright colours on screen. Everything else is grey.

| Status | Icon |
| --- | --- |
| Backlog | grey dashed ring |
| Todo | light grey ring |
| In Progress | yellow ring, half filled |
| In Review | green ring, three quarters filled |
| Done | indigo disc with a check |
| Canceled, Duplicate | grey disc with a cross |

Icons are in `src/features/issues/icons.tsx`. Don't draw new versions elsewhere.

## Type and spacing

- Inter, 15 px for most text, 13 to 14 px for quiet text. Page titles 24 px semibold.
- Radius 8 px (`rounded-lg`) for buttons, inputs, cards, groups.
- Controls are 40 px tall (`h-10`) in toolbars and 36 px in the sidebar. Issue rows are 44 px.
- Page padding 32 px (`px-8`), sidebar 280 px wide.

## Pieces

- **Sidebar**: logo and "Sprawniej" at the top; Inbox, My issues; small grey section labels in sentence case
  (*Workspace*, *Your teams*); your picture, name and @login at the bottom with a menu.
- **Top bar**: sidebar toggle, a thin divider, breadcrumbs (`Sprawniej / 🛠️ Engineering / Issues`), the save chip,
  and the search box with `⌘K`.
- **View and project pages**: emoji and name on top; Filter, Display and List / Board sit on the right beside the
  description (below it on a narrow screen), never on a row of their own.
- **Buttons**: outlined by default (like Punchcard's `Today`). One white filled button per screen at most, for the
  main action (like `+ Track time`). Icon buttons are square.
- **Switches between options** (List / Board): joined buttons where the chosen one has a light border and a
  raised background (`src/components/Segmented.tsx`), like Punchcard's Day / Week / Month.
- **Tabs that are pages** (Active / Backlog / All issues): separate outlined buttons (`src/components/Tabs.tsx`).
- **Issue row**: priority, ID, status, title (with `code` in backticks), sub-issue counter, labels, assignee, date.
- **Board card**: ID and assignee, then status and title, then priority, counter and labels.
- **Empty states**: an icon, a short title, one sentence in plain words about what goes here, and one button
  (`src/components/EmptyState.tsx`).

## Behaviour

- Everything saves by itself. Never add a Save button or a "you have unsaved changes" prompt.
- Every control works with the keyboard and shows a focus ring.
- Hover shows a soft `accent` background; the selected item keeps it.
- Show the save state quietly in the top bar ("Saved", "Saving…", "Offline: your changes are safe on this device").
  Don't interrupt people with dialogs for normal syncing.
- Works on a phone: the sidebar becomes a sheet, boards scroll sideways.

## Do and don't

- Do reuse `src/ui` (shadcn) and `src/components` before making something new.
- Do write labels people understand without training ("No one" rather than "Unassigned user").
- Don't use colour for decoration.
- Don't show git words to teammates (see CLAUDE.md, writing).
