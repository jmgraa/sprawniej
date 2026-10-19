# Sprawniej: working rules

Sprawniej is our internal tool for planning and tracking work: issues, teams, projects and views with emojis, in a
list or on a board. It is a
static web app (GitHub Pages). **The workspace is a GitHub repo**: every issue, comment and view is a small file
in it, and the app saves by committing and pushing. There is no server of our own. Sign-in is a classic GitHub
token, so your GitHub account is your Sprawniej account.

Read before changing things:
- [docs/architecture.md](docs/architecture.md): how the pieces fit, how saving and syncing work, merge rules
- [docs/data-format.md](docs/data-format.md): every file in a workspace repo
- [docs/design.md](docs/design.md): how screens should look
- [docs/linear-import.md](docs/linear-import.md): what the Linear import brings over
- [docs/user-guide.md](docs/user-guide.md): the guide for teammates (also the in-app Help page)

## Golden rules
- **No Save buttons, ever.** Every change saves by itself. If something seems to need one, it needs auto-save instead.
- **Every change goes through `src/data/actions.ts`.** Components never write files, call git or set the data store
  themselves. One path means "always saved" stays true.
- **One file per thing, one writer per file where we can.** That is what keeps merges painless. A new kind of data
  gets its own folder of small files, not a field in a shared file.
  The one exception is the archive: archived issues are packed into one file per team and month, read only when
  needed, so old work doesn't slow anything down (docs/architecture.md, "Archive").
- **The repo format is a promise.** Changing what a file means or where it lives is a MAJOR release with a migration.
  Unknown fields must survive a read and write (schemas use `.passthrough()`).
- **Every format change is backwards compatible.** Older versions of the app stay open for days (an update waits
  until the person clicks Update or closes every tab) and read and write the same repo. So:
  - Only add optional fields, files or folders; never put a value in an existing field that an older schema
    rejects. An older version skips a file it can't read, and when it rewrites an archive month file it drops the
    lines it can't read: that loses data.
  - When a field needs a new kind of value, write a value older versions understand there and the new one in a new
    field next to it (see the stand-in statuses: `status: canceled` + `customStatus`, in `src/data/files.ts`).
  - An older version editing and saving must not lose what a newer one wrote, and its own edits must win where they
    conflict.
  - Before releasing a format change, run the old (`main`) and new builds side by side on a throwaway workspace,
    edit from the old one, and check the new one still sees everything (docs/architecture.md, "Older versions").
- **Priorities and the built-in statuses are fixed** (`src/model/status.ts`). A workspace's own statuses
  (`statuses/<id>.json`) come on top, each in one of the fixed groups; the Linear import brings them.
- **Classic tokens only.** No fine-grained tokens, no OAuth app, no proxy server.
- **No agents or AI features.**

## Code map
`src/app` frame and routes · `src/model` schemas and statuses · `src/data` store, selectors, actions ·
`src/features/<area>` screens · `src/components` small shared pieces · `src/ui` shadcn components (generated with
`bunx --bun shadcn@latest add <name>`; fix the `cn` import to `@/lib/utils` after adding) · `src/github` every call to
GitHub · `src/sync` the local copy, saving, pulling and merging · `src/session.ts` who is signed in.

## Releasing
`main` deploys to GitHub Pages and **real people use it**.
- Work on a branch (`git switch -c feat/<name>`); push to `main` only a complete, tested feature.
- Before merging: `bunx tsc -b`, `bun test`, `bun run lint`, `bun run build`, and drive the real flow in a browser.
- Every merge into `main` is a release. Pick the version bump in `src/version.ts` **before** merging, add an entry at
  the top of `CHANGELOG` there (date = the day it ships), mirror the version in `package.json`, and run
  `bun scripts/changelog.ts`. Notes are for the people using Sprawniej ("Drag issues between columns"), not commit titles.
  - PATCH: fixes, wording, speed. Nothing new to learn.
  - MINOR: a new feature, or a visible change to how something works.
  - MAJOR: the repo format changes, or people's habits break.
- Source-only work (docs, tests, invisible refactors) doesn't bump anything.

## Commits
Title line only, plain words. No AI attribution trailers.

## Testing
- `bun test` for logic (`tests/`): selectors, merging, ordering, import mapping. Keep logic in plain functions so it can be tested.
- Browser checks: **never drive the user's own Chrome.** Use a private headless browser: `bun add playwright-core`
  in a scratch folder, `chromium.launchPersistentContext('<scratch>/profile', { channel: 'chrome', headless: true,
  serviceWorkers: 'block' })` against `bunx vite preview --port 5299` of a fresh `bun run build`. Blocking the
  service worker stops the PWA cache from serving an older build.
- Two people at once: two origins (ports 5298 and 5297) have separate storage. Two tabs on the same origin share
  one leader (docs/architecture.md, "Several tabs"); test both.
- Sync tests use a throwaway repo, never a real team's workspace.
- `window.sprawniej` has `data` (the store), `actions` (everything a person can do) and `sync` (`status`, `workspace()`),
  so a script can drive and check the app without clicking through every screen. Call `sync.workspace().syncNow()` to
  sync at once instead of waiting 30 s (in a follower tab it asks the leader, which skips checks closer than 5 s apart).
- Never write a GitHub key into a file (scripts, `.env`, the repo). Pass it as an environment variable for one command.

## Design
Follow [docs/design.md](docs/design.md). Use a shadcn component before writing a new one. Bright colours are only for
meaning (statuses, priorities, labels); everything else is neutral grey.

## Writing
- Simple, friendly words everywhere: UI, docs, changelog. Many teammates are not technical.
- **Don't compare Sprawniej to other products** ("like in Linear") in the app, the user guide or the README. It is
  its own tool and should explain itself. The one exception is the Linear import, which has to name what it imports from.
- **No em dashes** anywhere. Use a comma, colon, parentheses or a new sentence.
- Screens that teammates see never say commit, push, pull, merge, repo or token. Say "saved", "updated with your
  teammates' changes", "where your workspace is stored", "GitHub key".
- Every new feature updates `docs/user-guide.md` and gives its empty list a helpful empty state (what goes here + one button).
