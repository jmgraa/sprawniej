# How Sprawniej works

Sprawniej is a web page and nothing else. There is no server of ours. The data lives in a **GitHub repo** that
the team picks: each issue, comment, view and project is a small file there. The page keeps a copy of that repo in
the browser, changes files when you work, and sends the changes to GitHub on its own.

We don't run git in the browser: we only ever talk to GitHub, so we use GitHub's API directly. That needs fewer
requests and no special tricks.

## The big picture

```
Browser (Sprawniej, a PWA on GitHub Pages)
  React screens
     |  call
     v
  src/data/actions.ts  (the only code that changes data)
     |-> data store (zustand)              the screen updates at once
     |-> "pending" file in IndexedDB       survives a closed tab or a crash
     '-> save (src/sync/engine.ts)         ~1.5 s later: one commit on GitHub

  every 30 s, on focus, on reconnect:
     "anything new?" -> download changed files -> merge with pending -> store

GitHub repo (for example acme/sprawniej-data) = the workspace
```

## Signing in

- You paste a **classic GitHub token** with the `repo` scope. In the app we call it a "GitHub key".
- The app asks GitHub who you are (`GET /user`) and uses your login, name and picture. That is your account.
  There are no separate passwords.
- The token stays in this browser (localStorage). Signing out removes it.
- People in a workspace are the people GitHub lets in (`GET /repos/{owner}/{repo}/assignees`). Each person also
  writes `people/<login>.json` the first time they open the workspace, so names and pictures work offline.
- Anyone who can push to the repo can change anything. We don't sign files.

### Joining a workspace (teammates)

The owner invites someone by GitHub username from Settings. The app adds them as a collaborator
(`PUT /repos/{owner}/{repo}/collaborators/{user}`) and gives back a join link made for that person
(`#/join/<owner>/<repo>?ws=<name>&by=<inviter>&for=<invitee>`) with a ready-to-send message. Settings only shows
a link after an invite, so nobody gets a link without an invitation behind it. If the person signs in with a
different account than the one invited, the wizard says so instead of "no invitation found".

The link opens a wizard with one step per screen:

1. **Welcome**: what Sprawniej is, in one sentence, with the team's pictures.
2. **GitHub account**: "I have one" or "Create one" (opens github.com/signup).
3. **Accept the invitation**: a button to GitHub's invitation page. The app checks every few seconds and moves on
   by itself once it is accepted.
4. **Make your key**: a button opens GitHub's token page with everything filled in, next to three small
   screenshots (scroll down, press the green button, copy). The pasted key is checked at once, and errors say what
   to do ("This key can't open Acme's workspace yet. Did you accept the invitation in step 3?").
5. **That's you!**: your GitHub picture and name, and "Let's go".

Join links use the app's public address: `VITE_PUBLIC_URL` at build time, or else the address the app is served
from (`src/config.ts`). On localhost there is no link to share, so Settings says so after an invite instead of showing one.

**People from Linear.** Someone the Linear import brought who hadn't joined is `~name` (docs/data-format.md). An
admin links them to a GitHub account right after inviting it, or later from Settings (`LinkPersonDialog.tsx`).
`relinkFiles` (src/data/relink.ts) works out every file that changes: issues (live and archived), comments, project
leads, views, the teams their issues are in, the account's `people/` file (made from GitHub's profile if they haven't
opened the workspace, with `linearIds` so later imports match them) and the `~` file (removed). It all goes out as
one save. The Linear import uses the same helpers when it matches someone who hadn't joined.

A short tour follows the first visit. The owner's own setup (creating the workspace repo) is a separate, guided path.

### Workspace repositories

Repositories Sprawniej creates are private and named `workspace-sprawniej-<name>` (`src/features/onboarding/repoNames.ts`).
When you choose a workspace, those come first, under *Sprawniej workspaces*; any other repository you can save to is
listed after them and opens fine too. "Invitations for you" only shows invitations to `workspace-sprawniej-` repositories,
so the app never accepts an unrelated GitHub invitation.

## The copy in your browser

Each workspace has its own IndexedDB database (`src/sync/local.ts`) with:

- **base**: every file as it is on GitHub at a known commit,
- **pending**: your changes that haven't reached GitHub yet (a deleted file is stored as nothing),
- **meta**: which commit `base` matches, and the branch.

What you see is base with pending laid on top. The first time you open a workspace, every file is downloaded (100 per
request, through GitHub's GraphQL API). After that only changed files are.

## Saving (there is no Save button)

1. An action updates the store and writes the file to the local repo straight away.
2. After about 1.5 seconds without new changes (or at once when you hide the tab), all pending files go to GitHub as
   one commit with a plain message, such as `ENG-12: In Progress -> Done`. That is three requests: a new tree on top
   of the last known one, a commit, and moving the branch.
   GitHub allows each person about 500 such requests an hour, so a busy hour saves in bigger batches
   (`src/sync/pace.ts`): after 20 saves in the last hour we wait 4 s, after 60 we wait 10 s, after 120 we wait 30 s.
   Hiding the tab still saves at once.
3. Moving the branch refuses to overwrite a teammate's newer save. Then we pull, merge, and try again (up to 4 times).
4. An empty repository can't take a tree yet, so the very first file (`sprawniej.json`) is created through GitHub's
   contents API.
5. Offline, changes keep piling up in pending and go out when you are back online.
6. If GitHub still says "too many requests", the error carries when to come back (`Retry-After`, or the rate limit
   reset). We make no calls until then, and the save chip keeps saying "Saving…" with the time in its tooltip. It is
   not shown as an error, because nothing is lost.

Commits are authored as `Name <id+login@users.noreply.github.com>`, so GitHub shows them as yours.

## Several tabs

The same workspace can be open in many tabs, but only one of them, the **leader**, talks to GitHub and keeps the
browser copy (`src/sync/tabs.ts`). The leader is whichever tab holds a Web Lock named after the workspace. The
others are **followers**:

- On opening, a follower asks the leader for every file over a `BroadcastChannel` and shows them.
- A follower's change shows in that tab at once, then goes to the leader with each file as it was before and after.
  If the leader's version moved on in the meantime (a teammate's change arrived), the leader merges them by the
  usual rules. Until the leader confirms, the follower keeps showing its own version of those files.
- The leader sends every changed file (yours, other tabs', teammates') and its save chip to all followers.
- When a follower gets focus or is hidden, it asks the leader to check GitHub or to save now.
- When the leader tab closes, the next tab in line gets the lock, loads the browser copy, sends again whatever the
  old leader hadn't confirmed, and carries on. Followers then send it anything still unconfirmed.
- Signing out or entering a new GitHub key in one tab restarts the others.

So ten open tabs cost GitHub as much as one, and two tabs never race each other to save. A browser without Web
Locks lets every tab lead on its own.

## Getting other people's changes

The leader checks GitHub every 30 seconds while any tab of the workspace is visible, when the tab gets focus, and when the network comes
back. The check asks for the branch with an ETag, so "nothing changed" doesn't use up GitHub's rate limit. When the
branch moved, GitHub's compare API lists the changed files (if it can't, for example after a rewritten history, we
compare whole file lists by their git ids). We download only those, merge them with pending, and update the screen
before anything else runs, so your next edit starts from the merged version.

## Merge rules: nobody ever sees a conflict

Two people working at the same time must never be asked to choose between versions. Most things are separate
files with a single writer, so they can't clash at all. Where two people can touch the same file, the app merges
field by field, and when they changed the very same field the later save wins, exactly what a normal app with a
server does. The code is `src/sync/merge.ts` (`mergeIncoming`), and every row below has a test in
`tests/merge.test.ts`.

| What two people do at the same time | What happens | Notice? |
| --- | --- | --- |
| Comment on the same issue | Both comments appear (one file per comment) | No |
| Edit different fields of one issue (status, assignee…) | Both changes stay | No |
| Change the same field of one issue | The later save wins | No |
| Add or remove labels on one issue | Both sides' additions and removals apply | No |
| Edit different parts of a description | Lines merge | No |
| Rewrite the same lines of a description | The later save's lines win; the other version stays in GitHub history | No |
| Edit one view (filters, emoji, layout…) | Field by field; filter lists merge like labels | No |
| Edit one project, team, label or the workspace name | Field by field; the same field: later save wins | No |
| Join or leave the same team | Membership lists merge | No |
| Create issues | Separate files; if both got the same number while offline, the one not yet saved takes the next number | Yes, because the number changed ("ENG-12 is now ENG-14") |
| One deletes an issue, the other edits it | The edit wins and the issue stays | No |
| One moves an issue to another team, the other edits it | One issue, in the new team, with the edit | No |
| Mark inbox items as read on two devices | Read lists merge | No |
| Subscribe and unsubscribe on one issue | The lists merge like labels | No |
| Archive issues of the same month | Both end up in the month file (it merges line by line, by issue) | No |
| One archives an issue, the other edits or comments on it | The edit wins: the issue stays active, and the next tidy-up takes it out of the archive (a new comment joins the archived issue instead) | No |
| Delete, archive or move issues away from one team | The team remembers the higher of the two highest numbers | No |
| Drag issues around | Each drag rewrites only the moved issue; the same issue: later drop wins | No |

"Later save" means whoever's changes reach GitHub second. Someone who was offline for an hour and then comes back
counts as later, just as their request would arrive later at a server.

## Inbox notes

A change that someone should hear about (assigned, mentioned, a comment, a status change) writes one small file per
person into `inbox/<their login>/`, in the same save as the change. The rules for who hears about what are pure
functions in `src/data/notify.ts`: comments and status changes go to an issue's followers (creator, assignee,
commenters, mentioned people, plus `subscribers`, minus `unsubscribed`). Typing the same mention again, or moving an
issue to the same status again, within ten minutes doesn't send a second note.
Read marks live in `state/<login>.json`. The inbox tidies itself when the workspace opens (`tidyInbox` in
`src/data/actions.ts`), so it stays small however long a team uses it.

## Ordering and drag-n-drop

Each issue has a `sortOrder` string made with [fractional-indexing](https://github.com/rocicorp/fractional-indexing).
Dropping an issue between two others gives it a key between theirs (`src/data/ordering.ts`), so only the moved
issue's file changes, and two people reordering at once never clash. List and board use the same order. Dropping
into another column or group also changes that field (status, assignee, priority or project), in the same change.

Dragging is done with dnd-kit (`src/features/issues/useIssueDrag.ts`). While you drag, the order on screen is local
state; nothing is written until you drop. In a list, sub-issues sit under their parent, so a dropped issue gets its
key from the nearest issues at its own level (top-level issues among top-level ones, sub-issues among their
siblings). Reordering only means something in Manual order; under another ordering a drop can still change the
group, and otherwise we explain where to switch to Manual.

How a built-in page looks (grouping, ordering, what's hidden) is personal: it's kept in this browser per page
(`src/data/displays.ts`), never in the workspace. Filters set on a built-in page are personal too and last until you
leave the page. A saved view is different: its filters and display live in `views/<id>.json`, so changing them on
the view's page changes the view for everyone. Two people changing different filters at once both keep theirs
(filter lists merge as sets, see the merge rules).

## Code layout

| Folder | What's inside |
| --- | --- |
| `src/app` | The frame (sidebar, top bar), routes, the save chip |
| `src/model` | File schemas (zod), statuses (built-in and the workspace's own) and priorities |
| `src/data` | The store, pure selectors (filter, group, sort), `actions.ts`, the save queue |
| `src/github` | Every call to GitHub (REST and GraphQL), with errors in plain words |
| `src/sync` | The browser copy, the save and pull loop, merging, renumbering, save pacing, the leading tab |
| `src/session.ts` | Who is signed in, which workspace is open (localStorage) |
| `src/features/onboarding` | Sign-in, the join wizard, choosing and creating workspaces |
| `src/features/*` | Screens, one folder per area (issues, views, projects, inbox, import, help…) |
| `src/components` | Small shared pieces (avatar, empty state, segmented switch) |
| `src/ui` | shadcn/ui components |
| `tests` | `bun test` for the pure logic |

Routes use the URL hash (`#/team/ENG/issues/active`, `#/issue/ENG-12`) because GitHub Pages serves a single file.

## Issue history

There is no history file. Every save is a commit, so an issue's history is the history of its file: one GraphQL
request (`fileHistory` in `src/github/api.ts`) returns each commit that touched the file, who made it, and the file
as it was. `src/data/history.ts` compares each version with the next and turns the differences into lines ("moved it
from Todo to In Progress"). A few saves of the same thing by the same person close together read as one (typing a
title, clicking a status twice). A move between teams is followed back through the "Move ENG-3 to …" commit. The
history loads only when an issue page opens, again after that issue's changes are saved, and is kept while the app
is open (`src/features/issues/useHistory.ts`). Offline, the page simply shows comments without it.

## Archive

Finished issues are archived some months after they're done (`team.autoArchive`, 6 by default). Once a day, after
the first sync, the app runs `tidyArchive` (`src/data/actions.ts`), which moves due issues in batches of 300 and
mends the archive after crossed changes. Archived issues are packed into one file per team and month
(`teams/<KEY>/archive/<YYYY-MM>.jsonl`, docs/data-format.md), so a workspace with years of history stays at a few
thousand files instead of tens of thousands.

They're also not read when the app opens: `src/data/project.ts` keeps the month files as text and parses them only
when something asks (`loadArchive`): opening a link to an archived issue, searching, the Archived tab, project
progress, the import, or an inbox note about one. Numbers are still never reused: `nextNumber` looks at
`team.lastNumber` and at the numbers in the archive text, which it can find without reading the archive properly.

## Pictures

A pasted picture is saved as `assets/<hash>.<ext>` (the hash of its bytes, so the same picture is stored once) and
written into the Markdown as `/assets/<hash>.png`, which GitHub also shows. Private workspaces can't serve pictures by
address, so `src/data/assets.ts` shows them from the browser's own copy of the files.

## Keeping it fast

- The store keeps a separate object per kind of thing. Applying changed files copies only the kinds they touch, so
  a label change doesn't redraw issue lists.
- Sub-issue counters come from one index per version of the issues (`childIndex` in `src/data/select.ts`), not a
  scan per row.
- The issue title saves a moment after you stop typing, not on every key.
- The editor and the Markdown formatter load on their own, after the rest of the app (the editor a moment after the
  workspace opens). Code blocks colour a short list of languages (`src/editor/languages.ts`).
- Old finished issues are archived and packed into month files, which aren't read at start (see Archive). Measured on
  this machine, reading 15,000 small files from the browser's storage takes about 30 ms and parsing them about 55 ms,
  so opening a workspace isn't what's slow; the number of files is what costs: the first download on a new device
  (100 files per request, four requests at a time), GitHub's limit on how many files it lists at once, and how many
  issues every list has to go through. Archiving keeps all three small.
- A month file GitHub cuts short in GraphQL is fetched in full through the REST API; big files are sent on their own
  when saving.

## Main libraries

React 19, Vite, Tailwind v4, shadcn/ui (Radix), lucide icons, zustand, zod, idb-keyval (IndexedDB), yaml, node-diff3
(description merges), sonner (messages),
TipTap (descriptions and comments, stored as Markdown), dnd-kit (drag-n-drop), frimousse (emoji picker),
cmdk (the ⌘K palette), wouter (routes).

## New versions

Sprawniej is a PWA: a service worker keeps the app's files in the browser, so it opens without a network. A release
on GitHub Pages is downloaded in the background, then waits; on its own it would only take over once every Sprawniej
tab is closed. `src/app/updates.ts` asks for a new version every minute and whenever the tab comes back, and when one
is waiting shows a small toast once and an **Update available** button in the top bar (`UpdateButton.tsx`). Nothing
switches by itself. Updating sends whatever is still waiting to be saved, then lets the new version take over and
reloads. Another tab still running the old version recovers through the error screen (`Crash.tsx`), which reloads
once when a part of the old version can't be found any more.

### Older versions

Because nothing switches by itself, people run different versions against the same workspace for days. Every change
to the files must keep working for the versions already out there (CLAUDE.md, "Every format change is backwards
compatible"):

- An older version checks each file against its own schema and **skips** one it can't read: its issue vanishes from
  its lists. When it rewrites an archive month file, it **drops** the lines it can't read, so those archived issues
  are lost. Never write a value an older schema rejects.
- New things go in new optional fields, files or folders. Schemas use `.passthrough()`, so an older version keeps
  fields it doesn't know when it saves.
- Where a field needs a new kind of value, the file keeps a value older versions know and the new one goes next to
  it. Workspace statuses are the example: an issue in Blocked is written as `status: canceled` plus
  `customStatus: { id, as: canceled }` (`statusOut` / `statusIn` in `src/data/files.ts`, the same for views and
  inbox notes). An older version shows it as Canceled and keeps `customStatus` when it saves; if it changes the
  status, `status` no longer equals `as` and its change wins.
- Archive month files are written back with any line this version can't read kept as it is (`archiveLinesUnread`),
  so the next format change can't lose archived issues either.

To check a change: build `main` in a separate worktree (`git worktree add <dir> main`) and the branch, serve them on
two ports (two origins keep separate storage), point both at a throwaway workspace, make edits and archive issues from
the old one, then check the new one still shows everything as it should, and the files on GitHub still hold it.
