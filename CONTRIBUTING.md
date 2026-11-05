# Contributing

Bug reports, ideas and pull requests are welcome.

## Reporting a bug

Open an [issue](https://github.com/skik4/cs2-casual-enjoyer/issues) saying what you did, what you expected and what happened, with the app version from the footer. For a join that went wrong, attach `join-journal.log` from `%APPDATA%\cs2-casual-enjoyer`: it holds the connects sent and the states Steam and CS2 reported. It contains the Steam IDs of the players involved, so remove them if you prefer.

## Working on the code

Requires [Node.js](https://nodejs.org/) 22.12 or newer.

```sh
npm install
npm start
```

Before opening a pull request against `master`, check that:

- `npm test`, `npm run lint` and `npm run format:check` pass (`npm run format` fixes the formatting);
- new behaviour has tests in `__tests__/`;
- text the user sees comes from `src/i18n/locales/en.js` and `ru.js`, in both languages;
- commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(maps): …`, `fix(join): …`, `docs: …`.

## Project layout

| Folder                          | What is there                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/main/`                     | The Electron main process: the window, the settings store, CS2 Game State Integration, updates |
| `src/core/`                     | Renderer start-up and app state                                                                |
| `src/ui/`                       | The views, dialogs and the tutorial                                                            |
| `src/steam/`                    | Steam Web API requests and rich presence                                                       |
| `src/game/`                     | Joining, the Maps tab, pinned maps, CS2's state                                                |
| `src/i18n/`                     | English and Russian texts                                                                      |
| `css/`, `index.html`, `assets/` | The page, its styles, icons and fonts                                                          |
| `installer/`                    | The installer's shortcuts page                                                                 |
| `__tests__/`                    | Jest tests                                                                                     |
