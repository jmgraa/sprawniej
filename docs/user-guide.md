# Welcome to Sprawniej

Sprawniej is where our team keeps track of work: tasks, bugs and ideas. This page explains everything you need.
No technical knowledge required.

## Getting in

You need two things, and the join link walks you through both:

1. **A GitHub account.** GitHub is where Sprawniej keeps the team's work. If you don't have an account, the join
   link helps you make one (it's free).
2. **A GitHub key.** It's like a password that lets Sprawniej save your work for you. The join link opens GitHub
   with everything filled in. You just scroll down, press the green **Generate token** button, and copy the key
   back into Sprawniej.

You only do this once per browser. The join link also accepts the GitHub invitation for you.

The first time you open your team's issues, four short tips show you around. You can see them again from the
**Help** page (**Show the tour again**).

### Your name

Teammates see the name from your GitHub profile. To go by another one here, open **Settings and people** and
type it under **Your account**; it saves by itself. Your GitHub profile stays as it is. **Use your GitHub name**
puts the GitHub one back.

### Inviting someone

Open the menu under your name (bottom left) and choose **Settings and people**. Type their GitHub username and press
**Invite**. A join link made just for them appears below: copy it and send it to them. Their link is also next to
their name in the list until they join. A long list shows its first few people; **Show all** opens the rest, and
**Search people** finds anyone by name or username, even with a typo or without Polish letters. (Only the
workspace's admins can invite.) No GitHub account yet? Ask them to
make one first (it's free), then invite them.

If you moved over from Linear and some people there haven't joined yet, Sprawniej asks right after the invite
whether this is one of them. Pick who they were in Linear and press **Link**: their issues, comments and views
become theirs at once, even before they join. Not sure? Press **Skip**; you can link them later.

## Your work saves by itself

There is no Save button. Whatever you type or change is kept right away. In the top bar you'll see:

- **Saved**: everything is safe and your teammates can see it.
- **Saving…**: it's on its way, give it a second.
- **Offline: your changes are safe on this device**: no internet right now. Keep working; everything goes out when
  you're back online.

Your teammates' changes show up on their own, too.

### New versions

When a new version of Sprawniej is out, a small note says so, and **Update available** appears in the top bar next
to **Saved**. Nothing changes until you choose: press it when it suits you (whatever isn't saved yet is saved first,
then the page reloads), or just carry on, and the new version loads the next time you open Sprawniej.

## Issues

An **issue** is one piece of work: a task, a bug, an idea. Each has a short ID like `ENG-12` (team + number).

- **Create one:** press **C** anywhere, the pencil next to "Sprawniej" at the top left, or the **+** next to a group.
  Give it a title; status, priority, assignee, labels, project, parent, due date and estimate are optional buttons
  below.
  Press `⌘` `Enter` (or `Ctrl` `Enter`) to create it. Tick **Create more** to add several in a row. Closed it by
  accident? What you typed comes back the next time you start a new issue.
- **Open one:** click it. Change the title, description or any property on the right. It saves by itself.
- **Labels:** in the labels menu, type a name that doesn't exist yet and choose **Create label**.
- **Move to another team:** change **Team** on the right. The issue gets that team's next number; links and mentions
  of its old number still open it.
- **Archive:** the `⋯` button next to the title, then **Archive** (see Archive below).
- **Delete:** the `⋯` button next to the title, then **Delete issue**.
- **Links and formatting:** paste a link and it becomes clickable. Select some words and paste a link to turn
  them into a link. Type `**bold**`, `- ` for a list, or `[] ` for a checklist, and it formats as you type.
- **Mention someone:** type `@` and their name. They'll get a note in their Inbox.
- **Point to another issue:** type its ID, like `ENG-7`. Hold `⌘` (or `Ctrl`) and click it to open it.

### Working at the same time as others

You never have to choose between your changes and a teammate's. If you both change different things, both stay. If
you both change the same thing (say, the status, or the same sentence of a description), the one saved last stays, as
in any app. Nothing is ever really lost: every earlier version stays in the workspace history on GitHub.

### Statuses

| Status | Means |
| --- | --- |
| Backlog | We might do it some day. |
| Todo | We plan to do it soon. |
| In Progress | Someone is working on it. |
| In Review | It's done and waiting for someone to check it. |
| Done | Finished. |
| Canceled | We decided not to do it. |
| Duplicate | Someone already reported the same thing. |

### Priority

**Urgent** (orange), **High**, **Medium**, **Low** (fewer bars = lower), or no priority (three dashes).

### Due dates and estimates

- **Due date:** the day it should be done. Pick **Due date** on the right: **Today**, **Tomorrow**, **Next week**,
  **In two weeks**, or any day in the calendar. Lists and boards show it; it turns amber two days before and red
  once it's late (unless the issue is finished).
- **Estimate:** how big it is, in points: 1, 2, 3, 5 or 8. Bigger means more work. Pick **Estimate** on the right,
  or press `E` on an issue.

To see what's due first, choose **Ordering › Due date** under **Display**.

### Sub-issues

Big issues can be split into smaller **sub-issues**. The parent shows a counter like `2/5` (two of five done).

- **Add some:** open the issue and choose **Add sub-issues** under the description (or **+** next to "Sub-issues").
  Type a title and press `Enter`; the field stays open for the next one. `Esc` closes it. **More options** opens
  the full new issue form.
- **Make an existing issue a sub-issue:** change **Parent** on the right.

### Comments and history

Under each issue, **Activity** shows its comments and everything that happened to it, oldest first: who changed the
status, who it was given to, when the due date moved, and so on. The history comes from your workspace's saved
versions, so it goes all the way back (it needs a connection to show).

Talk about an issue in the comments. Type, then press `⌘` `Enter` or **Comment**. Formatting, links,
`@` mentions and issue IDs work just like in descriptions. A comment you haven't sent yet waits in this browser,
so you can leave and come back.

To change or remove one of your own comments, use the `⋯` on it: **Edit** (it saves as you type; **Done** when
you're finished) or **Delete**.

### Subscribing

You hear about comments and status changes on issues you **follow**. You follow an issue by itself when you created
it, it's assigned to you, you commented on it, or someone mentioned you in it. To follow any other issue, press the
bell next to its title; press it again to stop (even for your own issues). **Subscribers** on the right shows who
follows it, and you can add or remove teammates there too.

## Lists and boards

Every list of issues can be shown two ways. Switch with **List / Board** at the top right.

- **List:** rows grouped by status. Sub-issues sit just under their parent.
- **Board:** a column per status, with cards. Empty columns wait under **Hidden columns** on the right, together
  with statuses the tab leaves out (like **Done** on the Active tab). Drop a card on one to move the issue there; the
  column then shows up with that card in it.

**Drag and drop** works in both. Drag an issue up or down to change its order, or into another group or column to
change its status. Your teammates see the new order too. No mouse? Move to an issue with `Tab` (or `J` and `K`),
press `Space` to pick it up, use the arrow keys, and press `Space` again to drop it (`Esc` puts it back). On a phone,
press and hold an issue for a moment, then drag it.

**Several at once:** hold `⌘` (or `Ctrl`) and click issues to pick them, or press `X` on each. `Shift`-click picks
everything between the last one you picked and this one. Drag any picked issue and the others come along, side by
side. The bar at the bottom changes the status, priority, assignee, labels or estimate of all of them (or archives
or deletes them); `S`, `P`, `A`, `L` and `E` do the same. `Esc` lets go of them.

**Display** (next to List / Board) changes how the page looks, just for you:

- **Grouping:** by status, assignee, priority, project, or no groups at all. Dropping an issue into a group gives it
  that group's assignee, priority or project.
- **Ordering:** **Manual** is the order you and your teammates arrange by dragging. You can also sort by priority,
  by due date, by last update, or newest first. Dragging to reorder only works in Manual order.
- **Show finished issues** and **Show sub-issues** hide or show those.
- **Back to default** undoes your changes.

On your team's page, the tabs show:

- **Active**: Todo, In Progress and In Review.
- **Backlog**: ideas for later.
- **All issues**: everything, including finished work.
- **Archived**: issues put away (see below), with a search box.

## Archive

Finished issues leave the lists by themselves some time after they're done (six months unless your team picks
otherwise in **Settings › Archive**). That keeps lists short and the app quick. You can also archive any issue yourself
from its `⋯` menu, or several at once from the bar at the bottom; an issue's sub-issues go with it.

Archived issues aren't gone. Find them under the **Archived** tab of their team, or with `⌘` `K` search; links to them
still work. An archived issue can be read but not changed. Press **Restore** on it to bring it back, with its
comments, under the same ID.

## Teams

Your teams are in the sidebar under **Your teams**. Each team has its own **Issues**, **Projects** and **Views**.
Press **+** next to *Your teams* to join a team or create a new one. If you're in no team yet, Sprawniej asks which
teams you work with when you open the workspace; **Skip for now** if you'd rather look around first.

Point at a team in the sidebar and press **⋯** to:

- **Edit team:** change its emoji and name. It saves as you go. The short key (`ENG`) stays, so issue links keep working.
- **Leave team:** it leaves your sidebar; the team and its issues stay for everyone else. Join again with **+**.
- **Delete team:** removes the team for everyone, with its issues, comments, archive and its own views. Projects
  stay, without that team. You'll be asked to type the team's name first, because this can't be undone.

## Filters

**Filter** (above every list) narrows it down: by status, assignee, subscribers, priority, labels, project or team.
**Subscribers** finds the issues someone follows: ones they made, are assigned to, commented on, were mentioned in or
subscribed to. Each filter
shows as a chip. Click a chip to change it, or its **×** to remove it. Inside one filter, any of the chosen values
counts ("Todo or In Progress"); several filters must all match ("Todo, and assigned to Ana").

Filters you set on a team's page or on My issues are just for you, and go away when you leave the page. To keep
them, press **Save as view**.

## Views

A **view** is a saved set of filters with its own emoji, like "🐞 Open bugs" or "📊 Insights". Open **Views** in the
sidebar to see them, and **New view** to make one. A view shows issues from the whole workspace or from one team.

A view belongs to everyone. Changing its name, emoji, description, filters, grouping or List / Board saves straight
away, for everyone. In the list of views, click a view's emoji to change it, or use **⋯** to rename or delete it. On
the view's own page, click its name or description to change them. Deleting a view leaves its issues as they are.

## Projects

A **project** is a bigger goal made of several issues, like "New onboarding". **New project** on the Projects page
starts one. On its page you can change its emoji, name and description in place, and set its status, who leads it,
a target date and which teams work on it. The bar shows how many of its issues are done. In the list of projects,
click an emoji to change it, or use **⋯** to rename or delete a project.

Add issues to a project from the project's page, or pick the project on any issue. Deleting a project
(**⋯ › Delete project**) keeps its issues; they just no longer belong to a project.

## Labels

Labels like "Bug" or "Design" sort issues across teams. Make one right from an issue (type a new name in the
labels menu), or in **Settings › Labels**, where you can also rename, recolour and delete them. Changes apply to
every issue that has the label.

## Inbox

Your **Inbox** tells you when someone:

- assigns you an issue,
- mentions you with `@` in a description or a comment,
- comments on an issue you follow (see Subscribing above),
- changes the status of an issue you follow.

The number in the sidebar is how many you haven't read. Opening a note (or its issue) marks it read. Hover a note to
mark it read or delete it; **Mark all as read** and the `⋯` menu at the top work on all of them. Read notes clear
themselves after a month, and unread ones after three.

## Moving over from Linear

**Settings › Import from Linear** brings your teams, issues, comments, projects, labels and views over. You'll need a
Linear personal API key (the first step shows where to make one). Pick the teams, check who's who, and press
**Import**. Issue numbers stay the same (`ENG-123` is still `ENG-123`), and so do due dates and estimates. Issues
finished long ago go straight to the archive. Views keep the filters that fit, and the import tells you which views
lost some, so you can check them.

People who aren't in Sprawniej yet come over too, marked "hasn't joined": their issues, comments and views stay
theirs. To give them their work, link them to their GitHub account: right after you invite them, or later in
**Settings › People › People from Linear** (**Link to GitHub account**, admins only). Everything that was theirs
moves to their account. Linking can't be undone, so check the name first. You can run the import again later to
bring in new changes; nothing is copied twice, and people you linked stay linked.

## Handy keys

| Key | Does |
| --- | --- |
| `⌘` `K` (or `Ctrl` `K`), or `/` | Search issues and jump anywhere |
| `C` | New issue |
| `S` | Change status of the issue under the mouse (or the open one) |
| `P` | Change priority |
| `A` | Change who it's assigned to |
| `L` | Change labels |
| `E` | Change the estimate |
| `J` / `K` or `↓` / `↑` | Move to the next or previous issue in a list or board |
| `X` | Pick the issue (to change or move several at once) |
| `Enter` | Open it |
| `Space` | Pick it up to move it with the arrows; `Space` again puts it down |
| `Esc` | Let go of picked issues, or go back from an issue |

## On a phone

Sprawniej works in your phone's browser too. The menu button at the top left opens the sidebar. Press and hold an
issue to drag it.

## Pictures

Paste a picture (or drop one) into a description or a comment. It's kept in your workspace with everything else,
so only your teammates can see it. Pictures can be up to 10 MB.

## Something went wrong?

- **"Your GitHub key stopped working"**: keys can expire. Make a new one (the app shows a button that opens the
  right GitHub page) and paste it in.
- **"You don't have access to this workspace"**: ask the person who invited you to invite you again, then accept the
  invitation on GitHub.
- **Using a shared computer?** Open the menu under your name at the bottom left, choose **Sign out**, and confirm on
  the page that opens. It removes your key and the workspace from that browser.
