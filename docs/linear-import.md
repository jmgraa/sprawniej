# Importing from Linear

Settings → Import from Linear brings a Linear workspace over in one go. It talks to Linear's GraphQL API straight
from the browser (Linear allows that), so nothing passes through a server of ours.

## Steps

1. **Key**: paste a Linear personal API key (Linear → Settings → Security & access → Personal API keys). It is
   used for this import only and not stored.
2. **Teams**: pick which Linear teams to bring. Each becomes a Sprawniej team with the same key (`ENG`), so
   `ENG-123` stays `ENG-123`. If a team here already uses that key, the issues join that team (handy for the
   first team made during setup); type another key to make a new team instead. If that team already has an issue
   with the same number, the imported one gets the next free number, and the check step lists these.
3. **People**: Linear people are matched to GitHub people in the workspace by name. You can fix any match. Someone
   with no match comes as a person who **hasn't joined** (`people/~jan-kowalski.json`): their issues stay assigned to
   them, their comments are theirs and views about them work. They get no inbox notes and can't be @mentioned. You
   can also pick **No one**: their issues come in unassigned, and their comments say who wrote them. Someone linked
   to a GitHub account before (in Settings, or by an earlier import) is matched to it by their Linear id, whatever
   their names.
4. **Check**: how many teams, issues, comments, projects, labels and views will come over, and which views can't
   keep all their filters.
5. **Import**: everything is written as files and saved as `Import from Linear: 412 issues`. Big imports are
   saved in parts of 300 files (`… (part 2 of 5)`), with a progress bar; keep the page open until it's done.

The code: `src/features/import/linearApi.ts` reads Linear, `linearMap.ts` turns it into files (pure, tested in
`tests/linearImport.test.ts`), and `ImportPage.tsx` is the wizard.

## What comes over

| Linear | Sprawniej |
| --- | --- |
| Team (key, name, icon emoji) | Team |
| Workflow state | Status: by name first (`In Review`), then by Linear's state type (`started` → In Progress, `unstarted` → Todo, `backlog` → Backlog, `completed` → Done, `canceled` → Canceled). `Triage` becomes Backlog. |
| Priority 0 to 4 | Same numbers |
| Issue number, title, description (Markdown) | Same |
| Assignee, creator | Matched GitHub person, the person who hasn't joined, or no one |
| Subscribers | Subscribers (people who follow it anyway, by creating it, being assigned or commenting, aren't listed twice) |
| Labels | Labels (group labels are flattened: `Area/Charts` becomes `Area: Charts`) |
| Project (name, icon, description, state, lead, target date) | Project |
| Parent issue | Parent (sub-issues) |
| Sort order | `sortOrder`, keeping Linear's order |
| Comments | Comments, with the original author and date. Authors set to "No one" are shown as "From Linear: Name". |
| Due date, estimate | Kept (any estimate number stays as it is) |
| Created, updated, completed dates | Kept |
| Custom view (name, icon, description, filters) | View: a team's view stays with that team, a workspace view shows the whole workspace. See below for filters. |

Issues Linear has archived come along too, with their comments. Issues in Linear's trash don't.

Issues finished longer ago than the team keeps finished issues (six months unless it says otherwise) go straight
into the team's archive files, with their comments, instead of becoming a file each. They keep their numbers and can
be searched, opened and restored like any archived issue.

## What doesn't

- Cycles, SLAs, customer requests, integrations, agents: Sprawniej doesn't have them.
- Parts of a custom view's filters (see below), and its layout: imported views start as a list grouped by status,
  showing finished issues too. Change that on the view; a later import keeps it.
- Images and files uploaded to Linear stay as links to Linear. They only open for people signed in to Linear.

## Custom views

Views of the picked teams come over, plus workspace views. The key's owner sees their own private views too, and
those come over as well; a view here is shared with everyone. The icon becomes the view's emoji when it is one (🔎
otherwise), and the owner is the matched person.

A view's filters come over when they say "is" or "is any of" about these, joined with "and":

| Linear filter | Sprawniej filter |
| --- | --- |
| Status (a state, by id or name, or a type such as "started") | Status (a type brings every status of that kind) |
| Assignee (a person, or "no assignee") | Assignee; someone set to "No one" can't come over |
| Subscribers | Subscribers: people following the issue (who made it, are assigned, commented, were mentioned or subscribed) |
| "Assigned to Jan" or "Jan is subscribed" | Subscribers: Jan (people follow what they're assigned to) |
| Priority | Priority |
| Labels (a label, or every label in a group) | Labels. Labels a view needs come over even if no issue uses them yet. |
| Project (a project, or "no project") | Project |
| Team (on a workspace view) | Team |

Linear's app saves each filter as a list of choices inside the field (`assignee: { or: [{ id: { in: [...] } }] }`), and
a label filter also matches the label's sub-labels (`{ or: [{ name: … }, { parent: { name: … } }] }`); both are read.

Anything else is left out: "is not", other "or"s across different fields, dates, cycles, creator, text search and
so on. The view still comes over with the rest of its filters, so it may not show quite the same issues as in
Linear. If none of a view's filters can come over, the view stays in Linear instead of arriving as a view that shows
every issue (and a view an earlier import made for it is removed). The check step names both kinds of views.

`src/features/import/linearFilters.ts` does the filter mapping (tested in `tests/linearImport.test.ts`). If reading
views from Linear fails, the import goes on without them and says so.

## Running it again

Each imported file remembers its Linear id (`linearId`), and so does a team that took in a Linear team. Running the
import again picks those teams by itself and updates what came over instead of making copies, so you can import
once early and again on switch-over day. People who hadn't joined don't need another import: link them in Settings
(right after inviting them, or under People from Linear). If an import matches someone who hadn't joined to a GitHub
account, the same happens: everything that pointed at them (imported or made here since: issues, archived issues,
comments, project leads and views) moves to their account, their `~` file goes away, and their account remembers
their Linear id (`linearIds`). Linear's version wins for imported issues and views (except a view's layout,
which stays as you set it); issues and views made here are left alone.
Issues deleted in Linear stay here, and issues archived here since the last import stay archived.
