# Working rules for the rewrite

How the owner of this project wants work done. The rules are collected from many sessions on the 0.x app. Copy this file into the new repository as its `CLAUDE.md`, or point the new `CLAUDE.md` at it, so every session starts from it.

## Talking to the owner

- Answer in Russian. Code, comments, commit messages, the changelog and these documents stay in English.
- The owner often works over Remote Control from a phone. Every closing message has to stand alone: what was done, what failed or was not checked, and any question together with its choices.
- The owner knows CS2 casual first-hand. State a gameplay or UI mechanic as fact only when it was checked, in CS2's files, in documentation or by the owner in game. Otherwise say it is unverified, or ask. A confident wrong claim once cost trust: casual lets the joining player pick their team, and the server does not assign it.
- When the owner asks "why not X", answer with what X cannot do. Saying the other option is better is not an answer.
- Report results as they are: failing tests with their output, skipped steps as skipped, guesses as guesses.

## Decisions are the owner's

- Commit, push, build and release only when the owner asks. Ask before every GitHub release: a release is public at once, and installed apps pick it up.
- Closing a pull request without merging is the owner's click.
- Some items have been declined. Don't offer them again unless the owner brings them up:
  - Steam QR login and window automation to fetch the token;
  - other fonts than Steam's;
  - restyling old releases v0.3.0 to v0.5.2;
  - code signing;
  - an update window or overlay;
  - release notes inside the app.
- The 0.x app had a one-time data cleanup offered as an app feature. The owner wanted the data file fixed directly instead. Prefer a one-off script over app code for one-off fixes.

## Design rules

- **No magic-number waits in decision logic.** Waits are driven by real signals: Steam's own logs, GSI, Steam presence. A timeout is a named, commented fallback off the main path. When no signal exists, say so plainly and let the owner decide before relying on a constant. Back every timing claim with measured data. The owner called a fixed 6 s pause after each connect "a magic number"; timings differ between machines.
- **No extra setup for players.** Players will not be asked to set CS2 launch options or anything beyond a Steam web token or an API key. Some balk at those already. Features may rely only on:
  - the Steam Web API;
  - GSI, whose cfg the app writes itself;
  - files Steam writes on its own.
    The owner's own setup, such as CS2's `-con_logfile`, is a research tool only.
- **One answer per fact.** Before adding a source for something the app already decides, such as whether CS2 is open, find every place that decides it and route them through one module. Say which source wins and why.
- **Steam's look.**
  - Colours come from Steam's own `steamui/css/sp.css`. Don't sample screenshots.
  - The font stack is Motiva Sans, with Russian text in Arial, as Steam itself does.
  - Every long button has one fixed size, and every square button another.
  - No emoji anywhere: texts, tutorial or code. Signs are drawn icons, not typed characters.
- **Show but block.** A row the user cannot join, such as their own server, is shown with Join disabled and a reason, not hidden.

## Safety

- Read-only Steam API checks with the owner's token are fine. Never print the token, an API key, Steam IDs, the owner's IP address or e-mail. Never send the e-mail anywhere. Don't spoof browser user agents.
- Never launch the real app window without asking: it pops over the owner's CS2 game. For checks, use hidden or offscreen windows:
  - a temporary user-data folder;
  - writes outside that folder blocked;
  - all http(s) requests blocked;
  - steam:// link clicks stopped in the page, and permissions denied.
    Check that CS2 is not running first. Never use the system clipboard in checks.
- Copies of the repository with `node_modules` linked through a junction must have the junction removed first, before the copy is deleted. In the 0.x repo a recursive delete once followed a junction into the real `node_modules` and wiped half of it.
- On the owner's machine, git in the old repository needs `-c safe.directory=<repo path>` on every command. Commit messages go in through `-F <file>` and end with the co-author line the session prescribes.

## Testing

- Tests come from the specification in `spec/`. A behaviour without a test is not done.
- Each commit is tested on its own tree before it is made.
- Changes that matter in game (joins, CS2 detection, GSI) list what is still unverified in game, and the owner checks them when they play. Logs and the join journal are read afterwards to confirm.
