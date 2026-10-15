# The workspace repo

A workspace is a GitHub repo full of small, readable files. You can browse it on GitHub, edit a file by hand, or
look at its history. The app checks every file with the schemas in `src/model/schema.ts`. A file it can't
understand is skipped with a warning; it never breaks the app.

Format version: **1** (in `sprawniej.json`). Changing the meaning or place of any file below is a MAJOR release
and needs a migration.

## Layout

```
sprawniej.json                           the workspace: name, format version
people/<login>.json                      one person (written by that person)
people/~<name>.json                      someone the Linear import brought who hasn't joined (written by the import)
labels/<id>.json                         one label
teams/<KEY>/team.json                    one team
teams/<KEY>/issues/<id>.md               one issue
teams/<KEY>/archive/<YYYY-MM>.jsonl      archived issues of that month, with their comments (one per line)
teams/<KEY>/comments/<issueId>/<id>.md   one comment (written by its author)
projects/<id>.json                       one project
views/<id>.json                          one saved view
inbox/<login>/<id>.json                  one notification for <login> (written by whoever caused it)
state/<login>.json                       what <login> has read (written by that person)
assets/<sha>.<ext>                       pasted images
```

Ids are [ULIDs](https://github.com/ulid/spec): random, sortable by time, and never reused. File names use ids, not
titles or numbers, so renaming an issue never moves its file.

Fields we don't know are kept as they are when the app rewrites a file. Newer versions can add fields safely.

Teams, issues, comments, labels and projects that came from Linear carry a `linearId` (their id in Linear), so a
second import updates them instead of making copies (docs/linear-import.md).

## sprawniej.json

```json
{ "name": "Software Mansion", "format": 1, "createdAt": "2026-10-06T10:00:00.000Z" }
```

## people/mikolajpochec.json

```json
{ "login": "mikolajpochec", "githubId": 123456, "name": "Mikołaj Pocheć", "avatarUrl": "https://avatars.githubusercontent.com/u/123456" }
```

Usually written by that person when they first open the workspace, and kept in step with their GitHub name and
picture each time they open it. Linking someone from Linear to an account (below) can write it before they do, from
their GitHub profile; their own profile replaces the name and picture when they open the workspace, and keeps the
rest. A name the file already has stays when GitHub has none.

`nameSetHere` (optional): they typed their name in Sprawniej (Settings › Your account), so their GitHub name
doesn't replace it.

`linearIds` (optional): the Linear people this account was linked to, so a later import matches them by itself.

Someone the Linear import brought who isn't in the workspace yet has a login starting with `~`, which no GitHub
login can, `githubId: 0` and their Linear id (`linearId`). Issues, comments and views can point at them; they get no
inbox notes. Linking them to a GitHub account (in Settings, or by a later import that matches them) rewrites what
pointed at them, adds the account to the teams their issues are in, and removes the file.

```json
{ "login": "~jan-kowalski", "githubId": 0, "name": "Jan Kowalski", "avatarUrl": "", "linearId": "…" }
```

## teams/ENG/team.json

The folder name is the team key, which starts issue numbers (`ENG-12`). Keys are 1 to 7 capital letters or digits,
starting with a letter.

```json
{ "key": "ENG", "name": "Engineering", "emoji": "🛠️", "members": ["mikolajpochec", "ania-k"], "createdAt": "…", "lastNumber": 41, "autoArchive": 6 }
```

`lastNumber` (optional) is the highest number of an issue that was deleted, archived or moved to another team. A new issue
gets one more than the highest of all the team's issues and `lastNumber`, so a number is never given out twice and
an old link never opens a different issue. When two saves meet, the higher `lastNumber` wins.

`autoArchive` (optional) is how many months after an issue is finished it gets archived: `1`, `3`, `6`, `12`, or `0`
for never. Missing means 6.

## teams/ENG/issues/01J9Z….md

YAML front matter with the fields, then the description in Markdown.

```markdown
---
id: 01J9ZQ4M3K8Y2V6T0R5N7B1C9D
number: 12
title: Simplify `Insights` graphs
status: in_review
priority: 1
assignee: ania-k
labels: [insights]
project: 01J9ZP…
parent: null
dueDate: 2026-10-31
estimate: 3
sortOrder: a0V
createdBy: mikolajpochec
createdAt: 2026-10-02T09:12:00.000Z
updatedAt: 2026-10-06T16:40:00.000Z
completedAt: null
---
Charts should be easier to read at a glance.

- Move the per-row numbers into **tooltips**
- See [the design file](https://example.com)
```

| Field | Meaning |
| --- | --- |
| `number` | Shown as `ENG-12`. Final once it reached GitHub. |
| `status` | `backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`, `duplicate` |
| `priority` | `0` none, `1` urgent, `2` high, `3` medium, `4` low |
| `assignee` | A GitHub login, or `null` |
| `labels` | Label ids |
| `project`, `parent` | Ids, or `null`. `parent` makes this a sub-issue. |
| `sortOrder` | Position in lists and boards ([fractional index](architecture.md#ordering-and-drag-n-drop)) |
| `completedAt` | When it moved to Done, else `null` |
| `duplicateOf` | Issue id, only for `duplicate` |
| `dueDate` | Optional. A day, `2026-10-31`, with no time: the same day for everyone. |
| `estimate` | Optional. Points; the app offers 1, 2, 3, 5 and 8, and keeps any other number it finds. |
| `subscribers` | Optional. Logins that asked to follow the issue. |
| `unsubscribed` | Optional. Logins that asked not to follow it. |
| `formerRefs` | Optional. The numbers it had before it moved to another team (`["WEB-2"]`). Old links and mentions of those numbers open it; the numbers themselves are never given out again. |

People follow an issue by themselves when they created it, are assigned to it, commented on it or were mentioned in
it; `subscribers` adds people to that, and `unsubscribed` takes people out. Changing these doesn't change `updatedAt`.

There is no history field: an issue's history is read from the repo's own history (each save is a commit), by
comparing one version of the file with the next.

Moving an issue to another team moves the file to that team's folder and gives it a new number there.

## teams/ENG/archive/2026-03.jsonl

Archived issues, packed so that old work costs one line instead of an issue file plus a file per comment. One JSON
object per line, sorted by id: the issue's fields as above, its `description`, who archived it and when, and its
comments.

```json
{"id":"01J9ZQ…","number":12,"title":"Simplify Insights graphs","status":"done",…,"description":"Charts should…","archivedAt":"2026-09-04T08:00:00.000Z","archivedBy":"ania-k","comments":[{"id":"01J9ZR…","issue":"01J9ZQ…","author":"zosia","createdAt":"…","body":"Looks good"}]}
```

The month is when the issue was finished (`completedAt`, or `updatedAt` for canceled ones), so two people archiving
the same issue pick the same file. An issue archived before it was finished goes in the month it was archived.
Archiving deletes the issue file and its comment files; restoring writes them back and takes the line out (a file
with no lines left is deleted). Archived issues keep their numbers, and `lastNumber` remembers them. If an issue has
both a file in `issues/` and a line here (someone edited it while another person archived it), the file wins and the
line is dropped at the next tidy-up.

## teams/ENG/comments/<issueId>/<id>.md

```markdown
---
id: 01J9ZR…
issue: 01J9ZQ…
author: zosia
createdAt: 2026-10-03T11:00:00.000Z
editedAt: null
---
Colours are ready, see ENG-14. @ania-k
```

Only the author edits or deletes their comment.

## labels/<id>.json

```json
{ "id": "01J9…", "name": "Bug", "color": "#eb5757" }
```

## projects/<id>.json

```json
{
  "id": "01J9…", "name": "Insights page", "emoji": "📊", "description": "Charts that explain where the money goes.",
  "status": "in_progress", "lead": "ania-k", "teams": ["ENG", "DES"], "targetDate": "2026-11-15", "createdAt": "…"
}
```

`status` is one of `backlog`, `planned`, `in_progress`, `paused`, `completed`, `canceled`.

## views/<id>.json

```json
{
  "id": "01J9…", "name": "Bugs", "emoji": "🐞", "description": "Every open bug", "owner": "mikolajpochec",
  "team": "ENG",
  "filters": { "labels": ["bug"], "statuses": ["todo", "in_progress"] },
  "display": { "layout": "board", "grouping": "status", "ordering": "priority", "showCompleted": false, "showSubIssues": true },
  "createdAt": "…"
}
```

`team: null` makes a workspace view. Filters left out match everything. Filters: `statuses`, `assignees` (`null` =
no one), `subscribers` (people following the issue), `priorities`, `labels`, `projects` (`null` = none), `teams`. Inside one filter any value matches;
different filters must all match. `grouping`: `status`, `assignee`, `priority`, `project`, `none`.
`ordering`: `manual`, `priority`, `updated`, `created`.

## inbox/<login>/<id>.json

Written by the person who caused it, so it never clashes with anything.

```json
{ "id": "01J9…", "type": "assigned", "issue": "01J9ZQ…", "actor": "ania-k", "at": "…" }
```

`type`: `assigned`, `mentioned`, `commented`, `status`. `comment` holds the comment id for `mentioned` (when the
mention is in a comment) and `commented`. `status` holds the new status for `status` (sent when an issue is done or
canceled).

Notes don't stay forever: when someone opens the workspace, their read notes older than 30 days and unread ones
older than 90 days are deleted, and so is anyone's note older than 180 days. Deleting an issue or a comment also
deletes the notes about it.

## state/<login>.json

```json
{ "readUntil": "2026-10-05T00:00:00.000Z", "read": ["01J9…"] }
```

Everything up to `readUntil` counts as read ("Mark all as read"), plus the ids in `read`.
