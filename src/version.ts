/**
 * The app's version and its changelog: one list, which `scripts/changelog.ts` turns into CHANGELOG.md.
 * Newest release first. (The app doesn't show it anywhere yet.)
 *
 * Numbering (see CLAUDE.md): MAJOR.MINOR.PATCH. Major = the repo format or the way you work changes,
 * minor = a new feature, patch = fixes and polish. Notes are written for the people using Sprawniej.
 */
export const APP_VERSION = '1.8.0'

export interface Release {
  version: string
  /** YYYY-MM-DD */
  date: string
  /** what this release is about, one short line */
  title: string
  /** what changed, in the user's words */
  notes: string[]
}

export const CHANGELOG: Release[] = [
  {
    version: '1.8.0',
    date: '2026-10-15',
    title: 'Link people from Linear',
    notes: [
      'Right after you invite someone, Sprawniej asks whether they’re one of the people from Linear who haven’t joined. Link them, and their issues, comments and views become theirs at once',
      'Settings › People lists everyone from Linear who isn’t linked yet, with Link to GitHub account next to each (for admins)',
      'People you link stay linked when you import from Linear again, even if their names differ',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-10-15',
    title: 'Update when it suits you',
    notes: [
      'When a new version of Sprawniej is out, a small note says so, and Update available appears next to Saved',
      'Press it when it suits you: anything not saved yet is saved first, then the page reloads. Or carry on, and the new version loads next time you open Sprawniej',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-10-15',
    title: 'Safer teamwork',
    notes: [
      'A teammate’s change to a title or description is no longer undone when you leave the page, and their edits join the text you’re typing',
      'Saving keeps going after a bad connection or a slow answer from GitHub, and teammates’ changes keep arriving',
      'Two issues made at the same moment no longer push your other new issues to different numbers, and an open issue follows its new number',
      'An issue that moved to another team still opens from links to its old number',
      'When one person edits an issue another deletes, its comments come back with it',
      'Every Sign out checks for unsaved changes first, in all your workspaces',
      'Restoring an issue brings back the sub-issues archived with it',
      'Search finds an archived issue by its exact number first',
      'New issues made on the Backlog tab start in Backlog, and a new issue you closed by accident comes back next time',
      'Text written in Markdown is formatted when you paste it',
      'The Linear import also brings issues Linear has archived, keeps numbers unique on later imports, and adds new comments to archived issues',
      'Saving a view from the Active or Backlog tab keeps showing the same issues',
      'On phones, delete and ⋯ buttons are always visible',
      'If part of the app fails to load, you get a Reload button instead of a blank page',
      'Smaller fixes: duplicate label names, the tour covering the new issue dialog, initials for names with emoji, and some wording',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-09',
    title: 'Join links made for one person',
    notes: [
      'After you invite someone in Settings, you get a join link made just for them, so nobody gets a link without an invitation',
      'The link stays next to their name until they join, in case you need to send it again',
      'If someone opens their link while signed in to a different GitHub account, Sprawniej tells them and helps them switch',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-10-08',
    title: 'Longer issue numbers fit',
    notes: ['Issue numbers like WEB-123 stay on one line in lists, search and the archive'],
  },
  {
    version: '1.4.0',
    date: '2026-10-07',
    title: 'Pick your teams, and change them',
    notes: [
      'When you’re in no team yet, Sprawniej asks which teams you work with (or skip it and look around first)',
      'Point at a team in the sidebar and press ⋯ to change its emoji and name, leave it, or delete it',
      'Deleting a team says what goes with it and asks you to type the team’s name first',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-10-07',
    title: 'Emptied workspaces open again',
    notes: ['A workspace whose files were all removed now offers to set it up again, instead of saying you have no access to it'],
  },
  {
    version: '1.3.0',
    date: '2026-10-07',
    title: 'A Subscribers filter, and everyone comes over from Linear',
    notes: [
      'Filter by Subscribers to see the issues someone follows: ones they made, are assigned to, commented on, were mentioned in or subscribed to',
      'Importing from Linear brings people who aren’t here yet, marked “hasn’t joined”: their issues, comments and views stay theirs, and move to their account once they join and you import again',
      'Every Linear view about a person comes over now, including ones that use subscribers, and who’s subscribed to each issue comes too',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-10-07',
    title: 'Views from Linear keep their filters',
    notes: [
      'Views imported from Linear now keep their label and assignee filters, including “this label or anything under it”; import again to fix views that came over showing every issue',
      'A Linear view none of whose filters fit here (like one about subscribers) stays in Linear instead of showing every issue, and the import says which ones',
      'Labels a Linear view needs come over too, even when no issue uses them yet',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-07',
    title: 'Views come over from Linear',
    notes: [
      'Importing from Linear now brings your custom views too, with the filters that fit; the import names any view that lost some filters, so you can check it',
      'Change a view’s or a project’s emoji right in its list, and rename or delete it from the ⋯ menu',
      'Names and descriptions you can edit now light up when you point at them',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-07',
    title: 'Due dates, history, subscriptions and the archive',
    notes: [
      'Give issues a due date and an estimate; lists show them, late ones in red, and you can order by due date',
      'Every issue shows its history between the comments: who changed what, and when',
      'Subscribe to any issue with the bell to hear about its comments and status changes, or unsubscribe from your own',
      'On a board, empty columns and statuses the tab leaves out (like Done) wait under Hidden columns; drop a card there and the column appears',
      'Finished issues move to the archive after six months (or when you choose), so lists stay short and the app stays quick; find them under Archived or in search, and restore them any time',
      'Press E to set the estimate of the issue under the mouse',
      'The Linear import brings due dates and estimates, and puts issues finished long ago straight into the archive',
      'A new device downloads your workspace faster',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-07',
    title: 'Sprawniej 1.0',
    notes: [
      'Issue numbers are never given out twice, so an old link always opens the same issue',
      'Big workspaces open faster',
      'When you and a teammate rewrite the same words, the last save simply wins, with no notes to read',
      'Clearer messages when something goes wrong, and a button on every empty page',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-10-07',
    title: 'Phones, several issues at once, and a welcome tour',
    notes: [
      'Works on phones: the sidebar opens from the menu button, and you press and hold an issue to drag it',
      'Pick several issues with ⌘-click, Shift-click or X, then drag them together or change them all at once',
      'A short tour shows newcomers around; replay it from Help',
      'The Display menu closes when you pick up an issue',
      'Fixed: some issues with sub-issues showed an empty page',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-07',
    title: 'Search, shortcuts and pictures',
    notes: [
      'Press ⌘ K (or the search box) to find any issue by ID or title and jump to any page',
      'S, P, A and L change status, priority, assignee and labels of the issue under the mouse',
      'J and K move between issues; Esc goes back from an issue',
      'Paste or drop pictures into descriptions and comments',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-07',
    title: 'Import from Linear',
    notes: [
      'Settings › Import from Linear brings teams, issues, comments, projects and labels over',
      'Issue numbers stay the same, and people are matched by name (you can fix any match)',
      'Run it again later to bring in new changes without making copies',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-07',
    title: 'Comments, sub-issues and your inbox',
    notes: [
      'Comment on issues, with @ mentions; edit or delete your own comments',
      'A comment you haven’t sent yet waits for you if you leave the page',
      'Add sub-issues right from an issue: type a title, press Enter, type the next one',
      'Your inbox tells you when you’re assigned, mentioned, or someone comments on your issues',
      'Mark notes as read one by one or all at once, and delete the ones you’re done with',
      'Old inbox notes clear themselves, so your workspace stays quick',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-07',
    title: 'Tidier boards',
    notes: ['Boards show only columns with issues; empty ones wait under Hidden columns, and you can drop a card on them'],
  },
  {
    version: '0.4.0',
    date: '2026-10-07',
    title: 'Views, projects and labels',
    notes: [
      'Filter any list by status, assignee, priority, labels, project or team',
      'Save filters as a view with its own emoji, for the whole workspace or one team',
      'Rename views, change their emoji and filters in place; changes save for everyone',
      'Create projects with a status, lead, target date and teams, and see how much is done',
      'Manage labels in Settings: rename, recolour, delete',
      'Fixed: ⌘ Enter in the new issue dialog sometimes created the issue twice',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-07',
    title: 'Drag and drop',
    notes: [
      'Drag issues to arrange them, in a list or on a board',
      'Drop an issue into another column or group to change its status, priority, assignee or project',
      'No mouse needed: Space picks an issue up, arrows move it, Space drops it',
      'New Display menu: group and sort issues your way, hide finished issues or sub-issues',
    ],
  },
  {
    version: '0.2.1',
    date: '2026-10-07',
    title: 'Faster, and calmer with many tabs',
    notes: [
      'Sprawniej opens faster: the editor loads in the background',
      'Several tabs with the same workspace work together and save once',
      'Very busy hours save in small batches instead of hitting GitHub’s limits',
      'Typing an issue title saves once you pause, not on every key',
      'Long issue lists with sub-issues scroll more smoothly',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-07',
    title: 'Create and edit issues',
    notes: [
      'Press C anywhere to create an issue; only a title is needed',
      'Descriptions format as you type: bold, lists, checklists, code, links',
      'Type @ to mention someone, and an issue ID like ENG-7 to point at it',
      'Change status, priority, assignee, labels, project and parent from the issue page',
      'Create labels on the spot, move issues to another team, delete issues',
      'Working at the same time as teammates never asks you to pick a version',
    ],
  },
  {
    version: '0.1.1',
    date: '2026-10-06',
    title: 'Workspaces are easy to spot',
    notes: [
      'New workspaces are stored in a repository named workspace-sprawniej-…',
      'Those workspaces come first when you choose one',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-06',
    title: 'Sign in and everything saves by itself',
    notes: [
      'Sign in with your GitHub account, then open or create a workspace',
      'Invite people by their GitHub username and send them a join link that walks them through getting in',
      'Everything you change is saved on its own, and your teammates’ changes show up within half a minute',
      'Works offline: your changes wait on your device and go out when you’re back',
      'When two people change the same issue at once, both changes are kept wherever they don’t overlap',
      'Create teams and join the ones you work with',
    ],
  },
  {
    version: '0.0.0',
    date: '2026-10-06',
    title: 'A first look',
    notes: ['A sample workspace to click through: teams, issues in a list or on a board, views, projects and the inbox'],
  },
]

export const latestRelease = () => CHANGELOG[0]
