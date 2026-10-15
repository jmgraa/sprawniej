# Changelog

Versions are `MAJOR.MINOR.PATCH`: major = the repo format or the way you work changes, minor = a new feature,
patch = fixes and polish. Written from `src/version.ts` by `bun scripts/changelog.ts`.

## 1.7.0: Update when it suits you
*2026-10-15*

- When a new version of Sprawniej is out, a small note says so, and Update available appears next to Saved
- Press it when it suits you: anything not saved yet is saved first, then the page reloads. Or carry on, and the new version loads next time you open Sprawniej

## 1.6.0: Safer teamwork
*2026-10-15*

- A teammate’s change to a title or description is no longer undone when you leave the page, and their edits join the text you’re typing
- Saving keeps going after a bad connection or a slow answer from GitHub, and teammates’ changes keep arriving
- Two issues made at the same moment no longer push your other new issues to different numbers, and an open issue follows its new number
- An issue that moved to another team still opens from links to its old number
- When one person edits an issue another deletes, its comments come back with it
- Every Sign out checks for unsaved changes first, in all your workspaces
- Restoring an issue brings back the sub-issues archived with it
- Search finds an archived issue by its exact number first
- New issues made on the Backlog tab start in Backlog, and a new issue you closed by accident comes back next time
- Text written in Markdown is formatted when you paste it
- The Linear import also brings issues Linear has archived, keeps numbers unique on later imports, and adds new comments to archived issues
- Saving a view from the Active or Backlog tab keeps showing the same issues
- On phones, delete and ⋯ buttons are always visible
- If part of the app fails to load, you get a Reload button instead of a blank page
- Smaller fixes: duplicate label names, the tour covering the new issue dialog, initials for names with emoji, and some wording

## 1.5.0: Join links made for one person
*2026-10-09*

- After you invite someone in Settings, you get a join link made just for them, so nobody gets a link without an invitation
- The link stays next to their name until they join, in case you need to send it again
- If someone opens their link while signed in to a different GitHub account, Sprawniej tells them and helps them switch

## 1.4.1: Longer issue numbers fit
*2026-10-08*

- Issue numbers like WEB-123 stay on one line in lists, search and the archive

## 1.4.0: Pick your teams, and change them
*2026-10-07*

- When you’re in no team yet, Sprawniej asks which teams you work with (or skip it and look around first)
- Point at a team in the sidebar and press ⋯ to change its emoji and name, leave it, or delete it
- Deleting a team says what goes with it and asks you to type the team’s name first

## 1.3.1: Emptied workspaces open again
*2026-10-07*

- A workspace whose files were all removed now offers to set it up again, instead of saying you have no access to it

## 1.3.0: A Subscribers filter, and everyone comes over from Linear
*2026-10-07*

- Filter by Subscribers to see the issues someone follows: ones they made, are assigned to, commented on, were mentioned in or subscribed to
- Importing from Linear brings people who aren’t here yet, marked “hasn’t joined”: their issues, comments and views stay theirs, and move to their account once they join and you import again
- Every Linear view about a person comes over now, including ones that use subscribers, and who’s subscribed to each issue comes too

## 1.2.1: Views from Linear keep their filters
*2026-10-07*

- Views imported from Linear now keep their label and assignee filters, including “this label or anything under it”; import again to fix views that came over showing every issue
- A Linear view none of whose filters fit here (like one about subscribers) stays in Linear instead of showing every issue, and the import says which ones
- Labels a Linear view needs come over too, even when no issue uses them yet

## 1.2.0: Views come over from Linear
*2026-10-07*

- Importing from Linear now brings your custom views too, with the filters that fit; the import names any view that lost some filters, so you can check it
- Change a view’s or a project’s emoji right in its list, and rename or delete it from the ⋯ menu
- Names and descriptions you can edit now light up when you point at them

## 1.1.0: Due dates, history, subscriptions and the archive
*2026-10-07*

- Give issues a due date and an estimate; lists show them, late ones in red, and you can order by due date
- Every issue shows its history between the comments: who changed what, and when
- Subscribe to any issue with the bell to hear about its comments and status changes, or unsubscribe from your own
- On a board, empty columns and statuses the tab leaves out (like Done) wait under Hidden columns; drop a card there and the column appears
- Finished issues move to the archive after six months (or when you choose), so lists stay short and the app stays quick; find them under Archived or in search, and restore them any time
- Press E to set the estimate of the issue under the mouse
- The Linear import brings due dates and estimates, and puts issues finished long ago straight into the archive
- A new device downloads your workspace faster

## 1.0.0: Sprawniej 1.0
*2026-10-07*

- Issue numbers are never given out twice, so an old link always opens the same issue
- Big workspaces open faster
- When you and a teammate rewrite the same words, the last save simply wins, with no notes to read
- Clearer messages when something goes wrong, and a button on every empty page

## 0.9.0: Phones, several issues at once, and a welcome tour
*2026-10-07*

- Works on phones: the sidebar opens from the menu button, and you press and hold an issue to drag it
- Pick several issues with ⌘-click, Shift-click or X, then drag them together or change them all at once
- A short tour shows newcomers around; replay it from Help
- The Display menu closes when you pick up an issue
- Fixed: some issues with sub-issues showed an empty page

## 0.8.0: Search, shortcuts and pictures
*2026-10-07*

- Press ⌘ K (or the search box) to find any issue by ID or title and jump to any page
- S, P, A and L change status, priority, assignee and labels of the issue under the mouse
- J and K move between issues; Esc goes back from an issue
- Paste or drop pictures into descriptions and comments

## 0.7.0: Import from Linear
*2026-10-07*

- Settings › Import from Linear brings teams, issues, comments, projects and labels over
- Issue numbers stay the same, and people are matched by name (you can fix any match)
- Run it again later to bring in new changes without making copies

## 0.6.0: Comments, sub-issues and your inbox
*2026-10-07*

- Comment on issues, with @ mentions; edit or delete your own comments
- A comment you haven’t sent yet waits for you if you leave the page
- Add sub-issues right from an issue: type a title, press Enter, type the next one
- Your inbox tells you when you’re assigned, mentioned, or someone comments on your issues
- Mark notes as read one by one or all at once, and delete the ones you’re done with
- Old inbox notes clear themselves, so your workspace stays quick

## 0.5.0: Tidier boards
*2026-10-07*

- Boards show only columns with issues; empty ones wait under Hidden columns, and you can drop a card on them

## 0.4.0: Views, projects and labels
*2026-10-07*

- Filter any list by status, assignee, priority, labels, project or team
- Save filters as a view with its own emoji, for the whole workspace or one team
- Rename views, change their emoji and filters in place; changes save for everyone
- Create projects with a status, lead, target date and teams, and see how much is done
- Manage labels in Settings: rename, recolour, delete
- Fixed: ⌘ Enter in the new issue dialog sometimes created the issue twice

## 0.3.0: Drag and drop
*2026-10-07*

- Drag issues to arrange them, in a list or on a board
- Drop an issue into another column or group to change its status, priority, assignee or project
- No mouse needed: Space picks an issue up, arrows move it, Space drops it
- New Display menu: group and sort issues your way, hide finished issues or sub-issues

## 0.2.1: Faster, and calmer with many tabs
*2026-10-07*

- Sprawniej opens faster: the editor loads in the background
- Several tabs with the same workspace work together and save once
- Very busy hours save in small batches instead of hitting GitHub’s limits
- Typing an issue title saves once you pause, not on every key
- Long issue lists with sub-issues scroll more smoothly

## 0.2.0: Create and edit issues
*2026-10-07*

- Press C anywhere to create an issue; only a title is needed
- Descriptions format as you type: bold, lists, checklists, code, links
- Type @ to mention someone, and an issue ID like ENG-7 to point at it
- Change status, priority, assignee, labels, project and parent from the issue page
- Create labels on the spot, move issues to another team, delete issues
- Working at the same time as teammates never asks you to pick a version

## 0.1.1: Workspaces are easy to spot
*2026-10-06*

- New workspaces are stored in a repository named workspace-sprawniej-…
- Those workspaces come first when you choose one

## 0.1.0: Sign in and everything saves by itself
*2026-10-06*

- Sign in with your GitHub account, then open or create a workspace
- Invite people by their GitHub username and send them a join link that walks them through getting in
- Everything you change is saved on its own, and your teammates’ changes show up within half a minute
- Works offline: your changes wait on your device and go out when you’re back
- When two people change the same issue at once, both changes are kept wherever they don’t overlap
- Create teams and join the ones you work with

## 0.0.0: A first look
*2026-10-06*

- A sample workspace to click through: teams, issues in a list or on a board, views, projects and the inbox
