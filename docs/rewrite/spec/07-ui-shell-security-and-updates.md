# 07. UI shell, security and updates

Specification for the 1.0.0 rewrite of Casual Enjoyer: the window, the page around the views, the look, the languages, the tutorial, notifications, settings and credential storage, security, logging, updates and the installer. It states behaviour as requirements. The current Electron mechanism is named only as evidence, so the text holds for a Tauri 2 build (Rust core, web UI) as well as for an Electron build in TypeScript.

Written 2026-11-07 from the code at 0.9.7 (commit 4f1b311), its Jest tests, CHANGELOG 0.9.0 to 0.9.7 and the project's dated notes (steam-ui-style, auto-update, live-app-checks, no-extra-setup, v1-rewrite-plan, plus two facts from pending-game-check and casual-map-finder-research).

## 0. Reading this document

- Terms:
  - **core**: the trusted side. It owns the files, the OS, the updater and every network access outside the page. Today it is Electron's main process (`src/main/`).
  - **page**: the web UI. Today it is the renderer (`index.html`, `css/`, `src/core`, `src/ui`, `src/game`, `src/steam`, `src/i18n`).
  - **bridge**: the fixed set of calls the page may make to the core. Today it is `window.electronAPI`, built in `src/main/preload.cjs`.
- Each part gives what the user sees and can do, the rules (numbered, for tests to cite), edge cases, what is stored, why, and the current code.
- Evidence labels:
  - _Code_: a `path:line` reference at 0.9.7.
  - _Test_: a test file and test name.
  - _Measured_: an observation, with its date.
  - _User decision_: a decision of the user's, with its date and, where the notes keep them, the user's words.
  - _Inferred_: read from the code, not run.
  - _Not verified_: unchecked.
- Where a dated note and the code disagree, this document describes the code and names the difference.
- Placeholders: `<owner>` is the author's account name, which is the GitHub owner in `package.json` `build.publish` and appears in the footer's two profile links. `<SteamID64>` and `<version>` are also placeholders.
- Joining, the Maps tab, GSI, Steam's game log, credential parsing in the account panel, the CS2 launch overlay's flow and the join journal have specs of their own (`02-account-and-friends.md` to `06-steam-web-api.md` in this folder). They appear here only where the shell touches them.

## 1. Window

**What the user sees and can do**

- There is one window. It starts at 850 by 900, can never be smaller than 850 by 800, and resizes from its edges.
- The OS frame is gone, and the app draws its own 38 px title bar:
  - the language button at the left;
  - "Casual Enjoyer" in the middle;
  - Tutorial, Minimize and Close at the right.
- Dragging the bar moves the window.
- There is no maximize button. The OS can still maximize the window: Win+Up, snapping to the screen edge, and probably a double-click on the bar (_Not verified_).
- Close quits the app at once. There is no question and no tray icon, even while a join is running.

**Rules**

- W1. The window opens at 850 x 900, with a minimum of 850 x 800. It can be resized and maximized. Its size, position and maximized state are not remembered: every start opens at the start size, wherever the OS places it.
- W2. The window appears only once the page has loaded. The user never sees an empty or white window.
- W3. The whole title bar drags the window, except its buttons. The title text takes no clicks. Neither the bar nor the footer allows text selection.
- W4. The app never shows a menu bar.
- W5. The window title, as the taskbar shows it, is "Casual Enjoyer" in both languages.
- W6. Minimize minimizes the window. Close closes the only window, which quits the app.
  - On quit the core stops its background work: the local GSI listener, the update timer and the watch on Steam's game log.
- W7. A version that was downloaded but not installed by the user's click installs silently when the app quits normally (exit code 0).
  - The app does not start again afterwards.
  - A quit with any other exit code installs nothing.
- W8. Timing-critical work never slows down while CS2 covers the window, or while the window is unfocused or minimized.
  - Today all of this work runs in the page, with background throttling turned off.
  - If the page can be throttled in the new design, the work must run in the core.
- W9. The core tells the page when the window is minimized and when it is restored. The page can also ask whether the window is minimized now; it does this once, for a page loaded into a window that is already minimized.
  - An event that arrives before the answer wins over the answer, because the answer may be older.
  - Only "minimized" counts as out of sight. An unfocused window may stand on a second screen beside CS2.
  - The page learns of focus and blur by itself.
- W10. Nothing enforces a single instance. A second copy can start (see Part 12).

**Edge cases**

- If the core cannot say whether the window is minimized, the page takes "not minimized".
- Nothing is flushed when the window closes. The Maps store is saved 2 s after its last change, and the join journal buffers lines for 1 s, so up to that much is lost on quit. _Inferred_: there is no unload handler anywhere in `src/`.
- A crashed or hung page has no handler (_Inferred_).
- The app never replaces Electron's default application menu; it only hides it. So the menu's shortcuts (reload, developer tools, zoom) may still work in the shipped build.
  - The code does expect reloads: W9's question exists because of a reload while the window is minimized.
  - _Not verified_ in a packaged build.

**Stored**

- Nothing.

**Why**

- W8:
  - _Measured_ (the code comment gives no date): "a covered window counts as hidden: Electron then ran the join loop's 200 ms pauses at 1000 ms (measured). Joining happens exactly then."
  - CHANGELOG 0.9.0: "Timers keep full speed while CS2 covers the window".
  - v1-rewrite-plan (2026-11-07): Tauri's backgroundThrottling option is unsupported on Windows, per a mirror of its docs. This was one reason given for putting the logic in a Rust core.
- W9: with throttling off, the page's own visibility state stays "visible" even when the window is minimized, so the page cannot tell by itself.
  - Its users are the friends refresh and the Maps polling ("Fewer requests to Steam", 0.9.7). Both have their own specs.
- W2: "Show window after content is loaded to prevent flash".
- The frameless bar is part of the Steam-dialog look (Part 3).

**Code**

- Size: `src/shared/constants.js:121-126`, `src/main/main.js:90-98`.
- No OS frame and no menu bar: `main.js:95`, `main.js:118`. Shown after load: `main.js:98`, `main.js:144-146`.
- Throttling: `main.js:106-109`.
- Minimize and close: `main.js:156-166`, `src/main/preload.cjs:12-13`, `src/core/app.js:93-103`.
- Minimized signal: `main.js:168-182`, `preload.cjs:14-35`, `src/core/window-state.js:4-47`.
- Quit: `main.js:349-358`.
- Drag area: `css/window-bar.css:14`, `css/window-bar.css:50`, `css/window-bar.css:57`. Title: `css/window-bar.css:32-40`.
- _Test_ `__tests__/window-minimized-bridge.test.js`:
  - "the page gets the window state next to the window controls";
  - "isMinimized asks the main process";
  - "isMinimized says not minimized when the main process cannot answer";
  - "onMinimized passes on each minimize and restore, until unsubscribed";
  - "the main process sends and answers on the preload's channels".

## 2. Page layout

**What the user sees and can do**, from top to bottom:

1. The title bar (Part 1), fixed at the top.
2. A centred content column that scrolls between the two bars:
   1. A card area. It holds at most one card: an error, the private-list warning, or one of the two help texts (Part 6).
   2. The account bar or the account panel.
      - The bar shows the avatar, the name, the token status, a square refresh button and "Account". It is shown while the credentials work.
      - The panel, "Connect to Steam", has three steps and is shown otherwise, or while the user is editing.
   3. The join bar. It shows the running join attempt from any tab, with Cancel, and is hidden when no attempt runs.
   4. The tabs, in this order: **Friends, Maps, Fake Friends**. Each tab has a count badge.
      - The active tab's tool sits at the right of the tabs: the nickname filter for Friends, the search status for Maps. Fake Friends has no tool.
   5. The view of the active tab. The CS2 launch overlay covers the page whenever it asks a question.
3. The footer, fixed at the bottom and 36 px tall:
   - the GSI indicator at the left;
   - at the right, the update notice, then a dimmed group with the version and the author's Steam and GitHub links.

**Rules**

- L1. The title bar and the footer stay fixed, and the page between them scrolls. The page is padded at the top and bottom by the bars' heights, so nothing hides behind them.
- L2. The bars and the page share one background, fixed to the window, so they meet without a seam.
- L3. Column width:
  - at most 800 px, centred;
  - 1000 px once the window is at least 1200 px wide;
  - 1200 px, with wider padding, at 1600 px.
- L4. The tab order is Friends, Maps, Fake Friends.
  - Friends is open at every start; the choice of tab is not stored.
  - Exactly one view is visible.
  - Switching notifies listeners with the new view and the previous one. The Maps view polls only while it is shown.
- L5. A tab's count badge shows how many entries the tab holds, and nothing at zero.
- L6. Each tab tool is visible only with its own tab. The Maps status is cut short with an ellipsis rather than pushing the tabs aside.
- L7. The tab strip is announced as a tab list, and each tab as a tab with its selected state. The join bar and the update notice are live status regions.
- L8. Every word in the footer is 13 px. The GSI indicator is a coloured dot and a label:

  | State         | Dot    | Label (en)             | Label (ru)             |
  | ------------- | ------ | ---------------------- | ---------------------- |
  | active        | green  | CS2 connected          | CS2 на связи           |
  | waiting       | grey   | Waiting for CS2        | Ждём CS2               |
  | restart       | yellow | Restart CS2            | Перезапусти CS2        |
  | other-account | yellow | CS2 on another account | CS2 на другом аккаунте |
  | unavailable   | red    | GSI off                | GSI выключен           |
  | error         | red    | GSI error              | Ошибка GSI             |

  - Its tooltip explains the state. In "waiting", the tooltip adds "Click to launch CS2."
  - Only "waiting" is a button. Click, Enter (on key down, not on a repeat) or Space (on key up) opens the offer to launch CS2.
  - Neither key reaches the page. In every other state the indicator is plain text and not in the Tab order.
  - Before the first render it reads "GSI" in the waiting style. An unknown state shows the "unavailable" texts.

- L9. The version reads "v" followed by the version number.
  - It is a button that checks for updates (Part 10).
  - Under the mouse it is underlined and brighter.
  - In a development run, or when the core gives no update status, it is a disabled label with no tooltip.
- L10. The update notice sits to the left of the version, outside the dimmed group. It is hidden while there is nothing to say.
- L11. The author's links:
  - Steam profile: `steam://openurl/https://steamcommunity.com/id/<owner>`, opened in the Steam client.
  - GitHub profile: `https://github.com/<owner>`, opened in the default browser.
  - Their icons are grey, turn white on hover and rise by 1 px.
- L12. A hidden `h1` reading "Casual Enjoyer" gives the page its heading.

**Edge cases**

- If the core cannot give the version, the footer reads "vunknown" (see Part 12).
- If GSI never reports, the indicator still renders from the setup status: "waiting" when there is a bridge, "unavailable" without one.

**Stored**

- Nothing. The active tab is not stored.

**Why**

- Tab order: CHANGELOG 0.9.0, "The Maps tab comes before Fake Friends."
- The update notice is kept apart from the dimmed group "so it is not missed".
- All footer words are 13 px: from the font audit of 2026-11-07 and CHANGELOG 0.9.6. Before that, the version was 15.5 px and letter-spaced.
- Only "waiting" is clickable: "The others report something a launch would not fix".
- No key reaches the page from the GSI button: "Space would scroll it, and Enter would go on to press the Launch button the offer moves focus to".

**Code**

- Markup: title bar `index.html:21-70`; content `index.html:71-274`; tabs `index.html:177-202`; footer `index.html:275-321`.
- Layout: `css/layout.css:3-39`, `css/layout.css:49-186`, `css/responsive.css:4-19`, `css/views.css:3-72`.
- Tabs: `src/ui/view-tabs.js:7-73`. Maps polling on tab change: `src/core/app.js:266-269`.
- GSI indicator: `src/ui/gsi-status-indicator.js:11-111`, `css/gsi-status.css:3-69`, texts `src/i18n/locales/en.js:318-340`.
- Version: `src/core/app.js:351-359`, `src/ui/update-notice.js:165-171`, `css/layout.css:80-99`.
- _Test_:
  - `__tests__/gsi-status-indicator.test.js`: "is a button whose tooltip says it launches CS2", "%s opens the offer from the keyboard", "%s stays plain text: no click or key offers a launch".
  - `__tests__/update-notice.test.js`: "a development run, with no updates, shows the version as a label only".

## 3. Visual rules

**What the user sees**

- The app looks like Steam's own dialogs. The user's reference was Steam's "Game Info" window, in the compact variant that resembles the friends list.
- It is dark and flat, with nearly square corners. Steam blue marks the main action, and every other button is grey.
- Text is in Motiva Sans, Steam's typeface, with Russian in Arial, as in Steam.
- There is no emoji and no sign that a font would have to supply from elsewhere.

**Rules**

- V1. Every colour comes from Steam's own stylesheet, `<Steam>\steamui\css\sp.css`, and is never sampled from screenshots. A new colour uses an existing token rather than a new hex value. The current tokens:

  | Token                                                                               | Value                                                                          | Used for                                                                                                    | In sp.css (2026-11-07)   |
  | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------ |
  | `--bg-dialog`                                                                       | radial glow from the top left, `rgba(74,81,92,.4)` to 0 at 60%, over `#25282e` | page, title bar, footer, overlay and tutorial cards                                                         | yes, the same expression |
  | `--bg-dark`                                                                         | `#25282e`                                                                      | base background                                                                                             | yes                      |
  | `--bg-item`                                                                         | `#1d1f24`                                                                      | rows, cards, account bar and panel                                                                          | yes                      |
  | `--bg-panel`                                                                        | `#23262e`                                                                      | row hover                                                                                                   | yes                      |
  | `--text-primary` / `--text-secondary`                                               | `#dcdedf` / `#8b929a`                                                          | text                                                                                                        | yes                      |
  | `--blue-primary`                                                                    | `#1a9fff`                                                                      | links, focus frame, active tab, bars                                                                        | yes                      |
  | `--button-primary-gradient`                                                         | `linear-gradient(to right, #47bfff 0%, #1a44c2 60%)`                           | main action                                                                                                 | yes, the same expression |
  | `--button-secondary` / `-hover`                                                     | `#3d4450` / `#464d58`                                                          | other buttons, tab counts                                                                                   | yes                      |
  | `--button-text`                                                                     | `#dfe3e6`                                                                      | button text                                                                                                 | yes                      |
  | `--button-disabled`                                                                 | `#2e3136`, text 50% white                                                      | buttons that cannot be pressed                                                                              | yes                      |
  | `--red-primary`                                                                     | `#de3618`                                                                      | Close on hover, invalid field, error line                                                                   | yes                      |
  | `--steam-in-game` (= `--green-primary`)                                             | `#59bf40`                                                                      | free slot, on the server, GSI active                                                                        | yes                      |
  | `--steam-online`                                                                    | `#6dcff6`                                                                      | joining, "you're here"                                                                                      | yes                      |
  | `--steam-gold`                                                                      | `#d2b76a`                                                                      | Prime tags                                                                                                  | yes                      |
  | `--border-color`                                                                    | `#32353c`                                                                      | rules between parts                                                                                         | yes                      |
  | `--red-light`, `--red-dark`, `--green-dark`, `--yellow-primary`, `--purple-primary` | `#ff4444`, `#c0392b`, `#1e8e2e`, `#f1c40f`, `#a259f7`                          | error titles and expired token; invalid and valid field focus; warnings and GSI restart; the "missing" join | **no**                   |
  | hex values outside the tokens                                                       | `#c9a3ff` (the "missing" label), `#cfe3ff` and `#8ff09c` (step numbers)        |                                                                                                             | **no**                   |

  The "in sp.css" column comes from a search of the file on this PC (5,255,274 bytes, dated 2026-10-14), made on 2026-11-07 for this spec. The code comment says the palette was "read from the Steam client's steamui/css/sp.css". That holds for most tokens, but not for the rows marked "no".

- V2. Rows and cards are flat `--bg-item` boxes on the dialog background, one step darker than the dialog "so a long list stays apart".
  - Corner radius is 2 px for buttons and fields, 3 px for rows and bars, and 4 px for panels and cards.
  - Nothing has a shadow except the overlay and tutorial cards.
- V3. Buttons have no lift and are 13.5 px medium weight.
  - The primary button is Steam's gradient: 330% wide at position 25%, sliding to 0% on hover, solid `#1a9fff` while pressed.
  - Secondary buttons are grey and a shade lighter on hover. Waiting, Cancel and the rest are grey, so blue means "join now".
  - A disabled button is `#2e3136` with half-white text, "as Steam's unavailable Play button".
- V4. One size for every long button: 144 x 32 (`--button-width` 9rem, `--button-height` 2rem). One size for every square button: 32 x 32 (`--icon-button-size`).
  - The width fits the longest label, "Загрузить друзей" (124 px in Arial).
  - A label that does not fit widens the token for all long buttons; no single button grows.
  - Text fields are 32 px tall, so a field and its button line up.
  - Long: action, ghost and tutorial buttons, and the title bar's Tutorial. Square: icon buttons, the window buttons, the language button, and the fake friend's remove button. When the remove button asks "Remove?", it takes the long size.
  - Not buttons in this sense: text links, tabs, the Prime-only check box, the footer version and the GSI badge.
- V5. The title bar's buttons are transparent with grey icons. On hover they turn white with an 8% white shade, and Close turns Steam red.
- V6. Links have one look, for `<a>` and for link buttons alike: Steam blue, 13 px, no underline until hovered.
  - A disabled link is at 50% opacity.
  - Links that throw data away ("Clear") are grey, tinted red on hover, and bold red once armed.
- V7. Status words use the colours of Steam's friends list:
  - green for a free slot and "on the server";
  - blue for joining and for wherever the user already is;
  - grey for full;
  - dimmed for a finished match.
  - The avatar frame repeats the row's colour.
- V8. Text fields are a 25% black shade with no border, and take a Steam-blue border on focus.
  - Valid, invalid and expired-token fields get green, red and yellow borders.
  - Password fields are letter-spaced.
- V9. Typography: the page has one font stack, `"Motiva Sans", Arial, Helvetica, sans-serif`. It is one of Steam's own stacks (sp.css uses it 76 times; its most common stack is the same without Arial).
  - Only `body` names the stack, and everything else inherits it.
  - Buttons and form controls do not inherit by default, so they must be told to (`font: inherit` or `font-family: inherit`).
- V10. Motiva Sans ships with the app in four faces: 400, 400 italic, 500 and 700.
  - There is no 600 face, so weight 600 takes the Bold.
  - The styles may ask only for weights 400, 500, 600 and 700.
  - The files load locally and block until loaded, so no fallback text flashes and no network is used.
- V11. Motiva Sans has no Cyrillic. Russian text draws in Arial, while Latin letters and digits stay in Motiva Sans, exactly as Steam does.
  - Arial has only two weights: 500 renders regular and 600 renders bold.
- V12. Every character the app shows must exist in all shipped Motiva faces, Cyrillic aside. A sign the fonts lack is drawn instead of typed:
  - the check for a step done and for "on the server" is the Material "check" icon, used as a mask in the current text colour;
  - the map list's triangles are CSS borders, rotated when a map is open;
  - the status dots (account bar, GSI) are CSS circles;
  - the Prime-only tick is a CSS border shape.
  - Icon alt texts are exempt, since they show only if an icon fails to load.
- V13. No emoji anywhere. This covers:
  - every locale string;
  - every tutorial step: its title and content, no icon field, and no picture in the modal;
  - every file under `src/` and `css/`, and the page.
- V14. The keyboard focus frame: every button, every link with an address, and every element acting as a button shows a 1.5 px Steam-blue outline, 1 px outside it.
  - The frame appears only when the element is reached by keyboard (`:focus-visible`), never after a mouse click.
  - Text fields show their blue border on any focus.
- V15. Sizes in px:

  | Text                 | Size |
  | -------------------- | ---- |
  | row names            | 14.5 |
  | row details          | 12.5 |
  | tabs                 | 15   |
  | card title           | 14.5 |
  | card text and links  | 13   |
  | card lists and notes | 12.5 |
  | footer, all of it    | 13   |

  The title bar's title is bold, secondary grey, about 17 px, and letter-spaced by 1 px.

- V16. Motion:
  - colour changes take 0.18 s;
  - spinners turn once a second;
  - the tutorial's highlight glows on a 3 s cycle;
  - the update bar's width eases over 0.3 s.
- V17. Scrollbars are hidden, and the page scrolls by wheel and keyboard (_Inferred_ from the CSS, not looked at).
- V18. Tooltips are the platform's native ones, from `title` attributes. Windows draws them in its own font and style, outside these rules (_Measured_ 2026-11-07).
- V19. The app icon is greyscale, "so the app is not taken for the game" (CHANGELOG 0.9.0).

**Assets**

| Folder or file      | Contents                                                                                                                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets/fonts/`     | `MotivaSans-Regular.ttf` (400), `MotivaSans-RegularItalic.ttf` (400 italic), `MotivaSans-Medium.ttf` (500), `MotivaSans-Bold.ttf` (700). Plau's 2012/2017/2020 set: 520 characters, no Cyrillic. Only these four ship; the folder holds no other file.         |
| `assets/icons-svg/` | Material Symbols, outline 24 dp, black: `check`, `close`, `help`, `minimize`, `refresh`. Also `keep.svg`, a 24 x 24 pin with its own path. They are tinted by CSS filter chains (on the bars and buttons) or used as a mask in the current colour (the check). |
| `assets/logo-svg/`  | `github-mark-white.svg` and `steam-white.svg`, for the footer links.                                                                                                                                                                                           |
| `assets/icon.ico`   | Nine 32-bit images: 16, 24, 32, 48, 64, 72, 96, 128 and 256 px.                                                                                                                                                                                                |

**Edge cases**

- The 2026-11-07 font audit (_Measured_) had Chromium report the fonts behind each text in a hidden window, over 15 screens in both languages. Four signs had gone to other Windows fonts:
  - the check mark (U+2713) to Segoe UI Symbol;
  - the triangles (U+25B8, U+25BE) to Cambria Math;
  - the no-break hyphen (U+2011) in the Russian help's "e-mail" to Times New Roman;
  - the account bar's dot (U+25CF) to Arial.
  - All four were fixed in 0.9.6 (commit d421caf). The Russian help now says «по почте» instead.
- The same audit found that a `<button>` takes the page's font only when told to.

**Stored**

- Nothing.

**Why**

- _User decisions_, from steam-ui-style:
  - 2026-11-03: the compact, friends-list-like variant («вариант В»).
  - Not separately dated in the same note: colours from Steam itself, and one fixed size for long buttons and one for square ones: «кнопки прямоугольные должны быть фиксированного размера, как и квадратные своего фиксированного размера».
  - 2026-11-05: Steam's standard fonts, no emoji anywhere (the tutorial included), and help cards in the app's one style.
  - 2026-11-06: ship Motiva Sans, asked after the user had been told the licence terms. Decision: «как у Steam», Latin in Motiva Sans and Cyrillic in Arial. Other fonts are not to be offered again unless the user asks (free Cyrillic fonts were compared that day).
- The reason recorded: the user felt the earlier design had lost its coherence, and matching Steam exactly with uniform sizes restores it.
- _Measured_ 2026-11-06 on the Steam store (`?l=russian`, letters only): `'Motiva Sans', monospace` measured exactly like `monospace`, and the store's `'Motiva Sans', sans-serif` exactly like Arial. So Steam itself draws Cyrillic in Arial.
  - An earlier claim that Steam draws Cyrillic in Motiva Sans was wrong: that test's samples contained spaces, which Motiva Sans does have.
- Licence (steam-ui-style): Motiva Sans is a commercial typeface (Rodrigo Saiani for Plau), and Valve uses it under its own licence. Shipping it in the installer or the public repository would need an app or embedding licence. Steam's own font files are not to be fetched for the app. See Part 12.
- Difference from the notes: steam-ui-style first says the app ships no italic. The code now ships a 400 italic face, used by the launch overlay's hint, and the code wins.

**Code**

- Tokens: `css/variables.css:26-35`, `css/variables.css:112-115`, `css/variables.css:151-200`, `css/variables.css:207-217`.
- Buttons, sizes, links and the focus frame: `css/unified-buttons.css:30-133`, `css/unified-buttons.css:135-185`, `css/unified-buttons.css:187-195`.
- Fonts: `css/fonts.css:1-38`, `css/styles.css:3-4`, `css/base.css:17-33`.
- Drawn signs: `css/status.css:16-28`, `css/account.css:57-72`, `css/account.css:160-168`, `css/views.css:113-129`, `css/views.css:176-196`. Hex values outside the tokens: `css/status.css:42`, `css/account.css:152`, `css/account.css:157`.
- Fields: `css/forms.css:4-79`.
- _Test_:
  - `__tests__/fonts.test.js`: "every face is Motiva Sans in a TrueType file that ships with the app", "the font files are all used, and packed into the build", "the stylesheet loads the fonts before anything uses them", "the weights the styles ask for are 400, 500, 600 or 700, which the faces cover".
  - `__tests__/font-coverage.test.js`: "the fonts are read: Motiva Sans has Latin, digits and signs, no Cyrillic", "every character of the %s locale is in the app's fonts", "no other file the app ships shows a character outside its fonts".
  - `__tests__/no-emoji.test.js`: "no %s locale string carries an emoji", "the %s tutorial names and explains every step in words only", "no file the app ships carries an emoji".

## 4. Languages

**What the user sees and can do**

- The app speaks English and Russian.
- A square button at the left of the title bar shows the current language, "EN" or "RU". Its tooltip is "Switch Language" or «Сменить язык».
- A click switches to the other language at once, without a restart. Everything on screen re-renders in the new language, including an open card, the tutorial, the update notice and the launch overlay.

**Rules**

- I1. There are two languages, `en` and `ru`. Any other value means `en`.
- I2. The language at start is the first of:
  1. `language` in settings.json;
  2. `app_language` in the page's local storage;
  3. the system language: `ru` if it starts with "ru", otherwise `en`.
- I3. A switch saves the new language to settings.json (`language`) and to local storage (`app_language`).
  - Local storage is also written whenever the language changes at start, as from the built-in English to Russian.
  - settings.json is written only by the user's switch.
- I4. `t(key, params)` resolves a dotted key and replaces each `{name}` with its parameter.
  - A parameter that is not given becomes empty.
  - A missing key, or a key that holds no string, gives an empty text, silently.
- I5. `tPlural(key, count, params)`: the key holds one form per plural category of the language, chosen by the platform's plural rules.
  - English has `one` and `other`. Russian has `one`, `few`, `many` and `other`.
  - A missing category falls back to `other`, then to an empty text.
  - `{count}` is filled in. A key without forms gives an empty text.
  - The two plural keys today: `mapFinder.servers` and `mapFinder.searchingAmong`. The Russian forms after «среди» are genitive: «ищем среди 1 игрока», «ищем среди 3 игроков».
- I6. Texts reach the DOM in two ways:
  - Static markup. An element names its key in `data-i18n` and its target in `data-i18n-attr`: `text` (the default), `title`, `placeholder` or `html`.
    - It may name a second key and target (`data-i18n-second`, `data-i18n-attr-second`) and JSON parameters (`data-i18n-params`).
    - One pass applies them all at start and on every switch, and sets the document title.
  - Code-built UI. Each module calls `t()` or `tPlural()` as it renders, and re-renders itself on the language change. This covers rows, cards, the tutorial, the update notice, the GSI indicator, the launch overlay and the Maps view.
- I7. A locale string may contain markup: 11 of the 281 English strings do (`<br>`, `<strong>`, the launch spinner). Those are inserted as HTML. Text from Steam users (names, statuses, scores) is always escaped.
- I8. Number and date formats:
  - counts use the language's thousands separator: "19 510" in Russian, "19,510" in English;
  - dates are dd.mm and times are 24-hour, in both languages.
- I9. Every text the user sees comes from both locale files (CONTRIBUTING).
- I10. The Russian texts address the user with «ты». This is an observation of the current texts.
- I11. Both locales hold the same 279 keys, in 15 groups. The string counts are 281 in English and 285 in Russian, because the plural keys hold 2 forms in English and 4 in Russian:

  | Group         | Keys | What                                                         |
  | ------------- | ---- | ------------------------------------------------------------ |
  | common        | 13   | title, window buttons, tutorial buttons, language switch     |
  | index         | 11   | static page texts                                            |
  | notifications | 26   | close, the private-list warning, the launch overlay's phases |
  | help          | 29   | the SteamID and token/key help cards                         |
  | friends       | 9    | fake friend form and removal                                 |
  | views         | 5    | tab names, empty views                                       |
  | account       | 20   | account bar and panel                                        |
  | join          | 13   | row status labels                                            |
  | joinBar       | 5    | the join bar                                                 |
  | mapFinder     | 70   | the Maps view (2 plural keys)                                |
  | update        | 17   | the footer's update texts                                    |
  | gsi           | 13   | GSI labels and tooltips                                      |
  | errors        | 9    | Steam and network errors                                     |
  | validation    | 9    | field and profile-link messages                              |
  | tutorial      | 30   | the ten steps                                                |

  This was counted on 2026-11-07 for this spec. No test guards that the two locales match.

**Edge cases**

- A switch while friends are loading puts the button's "Load friends" label back over "Loading..." (the markup's second key).
- A switch with the tutorial open re-shows the current step in the new language, without replaying the step's transitions (Part 5).
- A switch with an error card open tells the same error again in the new language.
- A switch with the launch overlay up re-renders the overlay.
- A system language of Ukrainian, Belarusian or Kazakh gives English.

**Stored**

- `language` in settings.json: `"en"` or `"ru"`, present only after a switch.
- `app_language` in local storage.

**Why**

- Russian arrived in 0.5.2, with switching "without a restart".
- The user's decision of 2026-11-07 (v1-rewrite-plan): the PR #16 checklist becomes 1.0 tests. One of its items is "a language switch with the overlay up".
- Plural forms per category: `i18n-manager.js:68-75`.

**Code**

- Module: `src/i18n/i18n-manager.js:7-128` (start `97-108`, switch `86-95` and `117-120`, saving `49-53` and `110-115`).
- DOM pass: `src/i18n/dom-i18n.js:7-85`.
- Wiring: `src/core/app.js:89-91`, `src/core/app.js:154-162`, `src/core/app.js:255-264`.
- Locales: `src/i18n/locales/en.js`, `src/i18n/locales/ru.js`, `src/i18n/locales/index.js:7-10`.
- Formats: `src/ui/map-finder-view.js:47-51`, `src/ui/map-finder-view.js:596-600`, `src/ui/map-finder-view.js:814-818`, `src/ui/account-view.js:22-27`.
- Escaping: `src/utils/dom-utils.js:40-59`.
- _Test_:
  - `__tests__/i18n-plural.test.js`: "ru: %i servers is «%s»", "ru: after «среди» the noun takes the genitive", "en: one and other", "a key without forms gives no text".
  - `__tests__/core-utils.test.js`: "every error code has a text of its own in both languages".
  - `__tests__/update-notice.test.js`: "a language switch keeps the notice, in the other language".

## 5. Tutorial

**What the user sees and can do**

- The tutorial opens by itself on a first start, and from the Tutorial button at any time.
- A floating card walks through ten steps. It shows the step's title, "N of 10" with a progress bar, the text, and three buttons: Skip Tutorial, Previous and Next (Finish on the last step).
- The control a step talks about glows blue.
- Keys: Enter goes on, Backspace goes back and Esc skips, except while the user is typing in a field.

| #   | Step (index)     | Title (en)                | Points at                                   | What happens                                                 |
| --- | ---------------- | ------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| 1   | WELCOME (0)      | Welcome to Casual Enjoyer | nothing: centred                            | The key hint                                                 |
| 2   | CREDENTIAL (1)   | Steam token               | the "Token or API key: how to get one" link | A click on the link opens the token help and goes to step 3  |
| 3   | TOKEN_PAGE (2)   | Get Steam Web API Token   | the token link inside the help card         | The tutorial opens the help card; leaving the step closes it |
| 4   | PASTE_TOKEN (3)  | Paste Token               | the token field                             |                                                              |
| 5   | LOAD_FRIENDS (4) | Load friends              | Load friends                                | A click loads the real list                                  |
| 6   | FILTER (5)       | Filter Friends            | the nickname filter                         |                                                              |
| 7   | FRIENDS_LIST (6) | Friends List Display      | the friends list, card above it             | A made-up friend heads the list from here on                 |
| 8   | JOIN (7)         | Join to Friend Game       | the first row's Join, the made-up friend's  | A click goes on and starts no join                           |
| 9   | CONNECTION (8)   | Connection Process        | the row's status label, not glowing         | The made-up row shows Cancel; its label cycles               |
| 10  | DONE (9)         | Tutorial Complete!        | nothing: centred                            | "GitHub Releases" copies the releases page address           |

**Rules**

- T1. A start from the Tutorial button shows the Friends tab first. Starting opens the account panel, because the first steps point into it. A start while the tutorial runs does nothing.
- T2. The first start of the app starts the tutorial by itself. "First start" means settings.json gives nothing.
  - Nothing records that the tutorial was seen. Any later write to settings.json (credentials, language, a fake friend, Prime only) ends the automatic starts.
- T3. Placing the card:
  - below its target, 10 px away, kept 20 px from the window's edges;
  - above the target if it does not fit below;
  - otherwise beside the target, right first, then left;
  - otherwise vertically centred;
  - with no target, centred in the window.
  - Step 7 is forced above the list.
  - The card follows its target as the page changes: on resize and DOM changes, throttled to about 16 ms with a 100 ms debounce, and moves with a 0.3 s ease.
  - It is 504 px wide: three long buttons plus their gaps.
- T4. The highlight raises the target above the page and pulses a blue ring on a 3 s cycle. A link or label glows as one box.
- T5. Made-up data (`TUTORIAL_MOCK_FRIEND`) is a real public Steam profile, Gabe Newell's: his name and avatar, in a casual match on Dust II at 7:0 with a free slot.
  - From step 7 on, this friend heads the friends list.
  - Going back before step 7 removes him.
  - On step 9 his button reads Cancel, and his label cycles waiting, connecting, joined at 1.2 s each until the step is left. Then the label is reset and the button reads Join again.
- T6. Clicks during the tutorial:
  - the help link on step 2 opens the help and goes on;
  - on step 8 a Join click in the list goes on and starts no join;
  - on steps 7, 9 and 10, Join and Cancel clicks in the list do nothing;
  - on the last step, "GitHub Releases" copies the releases page address to the clipboard and says "Link copied" in green, or "Copy failed" in red, for 2 s.
- T7. While the tutorial runs, the friends auto-refresh does not start, its rounds are skipped, and a manual load does not start it either.
  - On stop, the refresh resumes after 500 ms if there are saved friends and saved settings.
  - Nothing else pauses: running joins, GSI, the updater and the footer go on.
  - The tutorial does not block the page: its overlay is transparent and lets clicks through.
- T8. Stop (Skip, Esc, or Finish or Enter on the last step):
  - removes the card, the highlights and the made-up data;
  - closes the account panel, unless the credentials still need entering;
  - resumes the refresh (T7).
  - Listeners hear `true` on start and `false` on stop, once each. A listener that throws does not stop the others.
- T9. A language switch rebuilds the steps and shows the current step again in the new language.

**Edge cases**

- A target not visible within 10 s is given up, and its observer disconnected.
- A nickname filter typed on step 6 that hides the made-up friend leaves steps 7 to 9 without targets, and the card centres.
- An error card open when step 3 begins blocks the help card. The step then waits for a link that never comes (Part 12).
- Enter, Backspace and Esc are captured app-wide while the tutorial runs. Enter on a focused button moves the tutorial on instead of pressing the button, and Esc never reaches the update question.
- Starting, stopping and leaving step 3 hide whatever card is open, not only the help the tutorial opened.
- Join clicks on steps 1 to 6 are not intercepted: a real friend's Join starts a real join.
- A broken settings file also reads as a first start.

**Stored**

- Nothing. No "done" flag exists. The `tutorial_done` field seen in a settings test is only sample data.

**Why**

- The tutorial has opened on the first start since 0.4.5 (CHANGELOG), with keyboard navigation (Enter, Backspace, Esc).
- The made-up friend: "The tutorial shows a mock friend; the refresh pauses while it runs" (`src/core/app.js:55`).
- The waits keep the code's reasons, or say none was recorded (`tutorial-timing.js:1-22`):
  - 0 ms to let the browser paint;
  - 50 ms "ensure previous process is fully stopped";
  - 500 ms "ensure tutorial cleanup is complete";
  - 2 s for the copy feedback and 10 s for an element: no reason recorded.
- _User decision_ 2026-11-07: the tutorial is one of the PR #16 checklist items that become 1.0 tests.
- No reason is recorded for copying the releases link instead of opening it.

**Code**

- Orchestration: `src/ui/tutorial/tutorial-manager.js:40-105` (start, stop, steps), `:112-234` (show and highlight), `:240-271` (first-run start), `:293-323` (listeners, language).
- Steps: `src/ui/tutorial/tutorial-steps.js:4-15`, `src/ui/tutorial/tutorial-templates.js:13-140`.
- Placement: `src/ui/tutorial/tutorial-ui-manager.js:144-325`, `:330-348`, `:378-429`. Highlight: `src/ui/tutorial/tutorial-highlight-manager.js:12-71`, `css/tutorial.css:104-142`. Card: `css/tutorial.css:17-40`.
- Made-up data: `src/ui/tutorial/tutorial-mock-data-manager.js:34-255` (cycle `:170-174`), `src/shared/constants.js:209-228`, `src/ui/friends-renderer.js:69-77`.
- Keys and clicks: `src/ui/tutorial/tutorial-event-manager.js:42-130`, `src/ui/friends-view.js:54-77`.
- Pauses: `src/core/app.js:56-59`, `src/core/app-friends-manager.js:60-63`, `:110-116`, `:331-337`, `:358-361`, `:419-422`, `:493-508`.
- First start: `src/core/app.js:305-314`. Button: `src/core/app.js:81-87`.
- _Test_:
  - `__tests__/tutorial-manager.test.js`: "tells its listeners true when it starts and false when it stops", "says nothing on a start while running or a stop while stopped", "a failing listener does not stop the others".
  - `__tests__/startup-auto-refresh.test.js`: "does not start while the tutorial is active", "the refresh stops with the tutorial and resumes after its wait", "nothing resumes without saved friends".

## 6. Notifications in general

**What the user sees**

- Every message appears inside the window. The app never uses OS notifications, sounds, taskbar flashing or badges.
- The channels:
  1. **Cards**, at the top of the content column, one at a time: an error, the private-list warning, the SteamID help, or the token/key help. A card stays until its square close button is clicked or another card replaces it. It has no timeout.
  2. **The CS2 launch overlay**: it dims (90%) and blurs (5 px) the page under a centred card, with Launch and Close.
     - When the offer comes from the GSI badge, the keyboard goes to Launch, or to Close when CS2 already runs.
     - When the overlay closes, the keyboard returns to the element that had it before.
     - Its flow has its own spec.
  3. **The join bar** (Part 2), a polite live status region.
  4. **The footer**: the GSI indicator and the update notice (Parts 2 and 10).
  5. **In place**: field borders, the fake friend's error line, the account status line (clickable while it warns), tab counts and the empty-view texts.
  6. **Native tooltips** (V18).

**Rules**

- N1. A card is a flat `--bg-item` box with 4 px corners, padded 12 px at the top and 18 px elsewhere.
  - Its title is 14.5 px semibold, its text and links 13 px, its lists and notes 12.5 px. A closing note is set off by a rule.
  - An error card has a 3 px red line at its left, and its title is light red.
  - The look comes only from the stylesheet: templates carry no inline style.
- N2. The close button is the app's square button, at the card's top right, with the tooltip "Close".
- N3. Error text:
  - the error's code picks the text, in the current language;
  - a plain string is shown as written;
  - an error with no known code shows "Something went wrong: <message>";
  - the text is always escaped.
  - A private friends list shows the privacy warning instead. When a valid SteamID64 is known, the warning links to the user's Steam privacy settings. The link is built only from a SteamID64.
- N4. A help card has a title, then one section per way of doing it (its name, the Steam link, paragraphs, short points), then a closing note.
  - Every link uses the app's one link look.
  - There are no pictures and no pictographs.
- N5. A language switch re-renders the open card. The card's kind and its error are kept for this.
- N6. The page may not raise OS notifications: the permission policy denies them (Part 8).

**Edge cases**

- A new card replaces the old one without a trace.
- If the page fails to start, a card reads "Failed to initialize app: <message>".

**Stored**

- Nothing. Only the open card's kind is kept, in memory.

**Code**

- Cards: `src/ui/notification-manager.js:26-122`, re-render `:127-194`. Templates: `src/ui/notification-templates.js:21-182`. Error texts: `src/utils/error-handler.js:10-79`. Styles: `css/notifications.css:3-174`.
- Launch overlay: `css/notifications.css:9-88`, focus `src/ui/cs2-launch-dialog.js:116-117`, `:218`, `:287`, language `:375`.
- _Test_:
  - `__tests__/notification-help.test.js`: "the SteamID help opens in the same call, headed by its title alone", "every link in the help texts carries the app's one link look", "no notification sets its own look inline: notifications.css alone does", "a language switch re-renders the help that is open", "the close button is the app's square button and hides the help".
  - `__tests__/notification-error-text.test.js`: "a language switch tells the shown error again", "a private friends list still shows the privacy warning".
  - `__tests__/notification-privacy-link.test.js`: "makes no link out of anything but a SteamID64".

## 7. Settings storage and credential encryption

**What the user sees**

- Credentials and choices survive restarts.
- A token saved by an older version keeps working.
- A settings file copied to another Windows account or PC loses its credentials, and the app asks for them again.

**Rules**

- S1. One file, `settings.json`, in the app's data folder `%APPDATA%\cs2-casual-enjoyer`. It is UTF-8 JSON, indented by 2 spaces.
  - The core owns the file.
  - The page reads it whole and changes it only by sending patches, through two bridge calls: load (the whole file, with credentials decrypted) and update (a patch).
- S2. A patch changes only the keys it names:
  - a key set to `null` is removed;
  - any other value replaces the stored one;
  - keys not in the patch stay as they are.
  - Patches apply one at a time, in the order sent, each on top of a fresh read of the file.
  - Each answers with the whole settings after the change, or `null` on failure. A failed patch does not block later ones.
- S3. A missing file reads as "no settings", without an error. An unreadable or broken file also reads as "no settings", and the error is logged.
- S4. Two fields hold credentials: `auth`, the Steam Web API token or key the app runs on, and `fof_api_key`, the key the Maps tab reads friends lists with.
  - On disk a credential is either a plain string or an object `{"encrypted": "<base64>"}`. An object is never a plain credential, so the two shapes can never be confused.
  - The bridge and the page only ever see plain values.
- S5. Every write encrypts every credential string afresh, so a rotated key is picked up by the next write.
- S6. If encryption is not available, credentials stay plain, and the store warns once per run.
  - A value that fails to encrypt stays plain for that write. The error names the field only.
- S7. A credential that cannot be decrypted reads as absent, and the app asks for it again. The error names the field only.
  - The next write of any field drops it from disk.
- S8. A credential never reaches a log. Logs name fields and keys, never values.
- S9. Encryption works only once the app is ready. The store is reached only through the bridge, which is registered after that point.
- S10. Mechanism today: Electron's safeStorage, asynchronous calls, which on Windows is Chromium's OSCrypt.
  - A random AES-256-GCM key sits in the data folder's `Local State` file (`os_crypt.encrypted_key`), protected by DPAPI for the Windows user.
  - Each value starts with "v10".
  - _Measured_ 2026-11-04: values were decrypted in memory this way, for a research script.
  - The layout after the prefix (12-byte nonce, ciphertext, 16-byte tag) follows Chromium's source and was not re-measured.
  - The synchronous calls are deprecated in Electron 45 and gone in 46. Values written by them still decrypt (_Measured_ 2026-11-06: 0.9.1's encrypted token decrypted under Electron 45, on a copy of settings.json and Local State).
- S11. The fields:

  | Field             | Shape                      | Written by                                                         | Meaning                                                      |
  | ----------------- | -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
  | `steam_id`        | string, a SteamID64        | Load friends                                                       | the account the app works for                                |
  | `auth`            | credential                 | Load friends; also at once, for a fresh token of the saved account | the token (as taken from the pasted page) or the Web API key |
  | `friends_ids`     | array of SteamID64 strings | Load friends                                                       | the friends list Steam last gave                             |
  | `fake_friend_ids` | array of SteamID64 strings | the Fake Friends tab                                               | IDs followed by hand                                         |
  | `fof_api_key`     | credential                 | the Maps key field (`null` deletes)                                | the key for reading friends lists                            |
  | `maps_prime_only` | `true`, or absent          | Prime only                                                         | absent means off                                             |
  | `language`        | `"en"` or `"ru"`           | the language button                                                | Part 4                                                       |

  ```json
  {
    "steam_id": "<SteamID64>",
    "auth": { "encrypted": "<base64>" },
    "friends_ids": ["<SteamID64>", "<SteamID64>"],
    "fake_friend_ids": ["<SteamID64>"],
    "fof_api_key": { "encrypted": "<base64>" },
    "maps_prime_only": true,
    "language": "ru"
  }
  ```

**Edge cases**

- A broken file starts the app as on a first start, tutorial included. The next patch then writes a file that holds only that patch, and everything else is gone.
- A transient read failure, such as a file locked by another program, takes the same path and can lose every setting (Part 12).
- The write is not atomic: the file is rewritten in place. A crash mid-write leaves a broken file, with the consequences above.
- Reads are not queued behind writes, so a load during a write may see a half-written file.
- Plain credentials from versions before encryption still read, and the next write encrypts them.
- A non-string value in a credential field is left as it came.

**Stored**, in `%APPDATA%\cs2-casual-enjoyer`:

- `settings.json` (above).
- `Local State`, Chromium's own file, which holds the encryption key.
- Local storage, which holds `app_language`.
- `gsi.json`, `map-finder.json` and `join-journal.log` (rotated to `.old`) belong to other specs.
- The folder takes its name from the package name. The packaged `package.json` has no `productName` (_Measured_ 2026-11-07 in the 0.9.7 build).

**Why**

- Patches: "two parts of the app saving different fields at the same moment can no longer overwrite each other".
- Encryption: "the file is of no use to another Windows account, or to the same account on another PC, instead of handing the token to whoever can read it". CHANGELOG 0.9.0: "The Steam token and the API key are stored encrypted on disk."
- An undecryptable value reads as absent because it is "most likely a settings file copied from another Windows account or PC". A token lives about 24 hours anyway.
- Importing into 1.0 (v1-rewrite-plan, 2026-11-07: "1.0 should import settings, key, friends and the pool"):
  - read settings.json;
  - for each `{"encrypted"}` value, unprotect the key from `Local State` with DPAPI, as the same Windows user, then decrypt the "v10" value with AES-256-GCM;
  - on any failure, ask for the credential again.

**Code**

- Store: `src/main/settings-store.js:4-33` (contract), `:50-61` (read), `:69-91` (patch queue), `:100-192` (encryption), `:201-208` (shape test).
- Bridge: `src/main/main.js:15`, `:57-60`, `:229-233`; `src/main/preload.cjs:41-63`.
- Writers: `src/core/app-friends-manager.js:303-307`, `src/core/app-input-manager.js:183-206`, `src/ui/fake-friends-manager.js:156-158`, `src/ui/map-finder-view.js:272-274`, `src/ui/map-finder-view.js:320-322`, `src/i18n/i18n-manager.js:110-115`.
- _Test_ `__tests__/main-settings.test.js` (SettingsStore):
  - "reads nothing when there is no file yet, without an error";
  - "merges a patch into what is stored";
  - "a null field removes it";
  - "patches sent at the same time all land";
  - "a failed write reports null and does not block later patches";
  - "a broken file reads as no settings and is reported";
  - "come back as they went in, and are not on disk in the clear";
  - "a plain value from before keeps working and is encrypted by the next write";
  - "stay plain when encryption is not available, which is said once";
  - "one that cannot be decrypted reads as absent, is reported and never crashes";
  - "are the only fields touched".

## 8. Security

**Rules**

- C1. The page has no access to the OS or to Node. It runs in the OS sandbox, in an isolated context, and its only door to the system is the bridge, a fixed set of named calls.
  - Today: `nodeIntegration` off, `contextIsolation` on, and `sandbox` on. Sandbox has been Electron's default since version 20; it is set explicitly.
  - The bridge script is CommonJS (`.cjs`), unlike the rest of the code. _Inferred_ reason: a sandboxed preload cannot load ES modules.
- C2. The page's content security policy, delivered in the page because the page is a local file:
  - `default-src 'self'`: everything comes from the app's own files unless a directive says otherwise.
  - `script-src 'self'`: no inline or remote script. The version display was moved out of an inline script for this.
  - `style-src 'self' 'unsafe-inline'`: inline style attributes are still used (Part 12).
  - `img-src 'self' data: https://*.steamstatic.com https://steamcdn-a.akamaihd.net`. These allow:
    - the app's icons;
    - the placeholder avatar a fake friend shows until Steam answers (`data:`);
    - Steam avatars on Valve's static domain and its akamai, fastly and cloudflare variants, "which Valve moves between". The wildcard takes any of them and nothing outside Valve.
    - The older `steamcdn-a.akamaihd.net` is named in full, because akamaihd.net "is shared by every Akamai customer". Narrowed in 0.9.2.
  - `font-src 'self' data:`.
  - `connect-src 'self' https://api.steampowered.com`: the page's only remote endpoint, the Steam Web API, which the page calls itself.
  - `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `upgrade-insecure-requests`.
  - No `navigate-to`: Chromium never shipped it. The core stops every navigation itself (C8).
- C3. The bridge, complete:

  | Bridge call                                      | Channel                                          | Kind   | In, then out                                          | If the call fails |
  | ------------------------------------------------ | ------------------------------------------------ | ------ | ----------------------------------------------------- | ----------------- |
  | `window.minimize()`, `window.close()`            | `window-minimize`, `window-close`                | send   | none                                                  | none              |
  | `window.isMinimized()`                           | `window-is-minimized`                            | invoke | boolean                                               | `false`           |
  | `window.onMinimized(cb)`                         | `window-minimized`                               | event  | boolean                                               | none              |
  | `settings.load()`                                | `settings-load`                                  | invoke | settings or `null`                                    | `null`            |
  | `settings.update(patch)`                         | `settings-update`                                | invoke | patch, then settings or `null`                        | `null`            |
  | `app.getVersion()`                               | `get-app-version`                                | invoke | version string                                        | `"unknown"`       |
  | `log.error`, `log.warn`, `log.info`, `log.debug` | `log-error`, `log-warn`, `log-info`, `log-debug` | send   | context, message, data                                | none              |
  | `gsi.getStatus()`                                | `gsi-get-status`                                 | invoke | setup status, once the GSI service has started        | `null`            |
  | `gsi.onState(cb)`                                | `gsi-state`                                      | event  | CS2 game state                                        | none              |
  | `updates.getStatus()`                            | `update-get-status`                              | invoke | updater status                                        | `null`            |
  | `updates.onStatus(cb)`                           | `update-status`                                  | event  | updater status                                        | none              |
  | `updates.check()`                                | `update-check`                                   | invoke | `available`, `latest`, `failed` or `off`              | `"failed"`        |
  | `updates.download()`, `updates.install()`        | `update-download`, `update-install`              | invoke | boolean: whether there was one to download or install | `false`           |
  | `mapFinder.load()`, `mapFinder.save(data)`       | `map-finder-load`, `map-finder-save`             | invoke | the Maps store                                        | `null`, `false`   |
  | `steamLog.serverChangesSince(ms)`                | `steam-log-server-changes`                       | invoke | `{usable, changes}`                                   | unusable          |
  | `steamLog.cs2State()`                            | `steam-log-cs2`                                  | invoke | CS2 process state                                     | unusable state    |
  | `steamLog.onCs2State(cb)`                        | `steam-log-cs2`                                  | event  | CS2 process state                                     | none              |
  | `joinJournal.append(lines)`                      | `join-journal-append`                            | invoke | lines, then a result                                  | `false`           |
  | `shell.openExternal(url)`                        | `open-external`                                  | invoke | url, then whether it went to the OS                   | `false`           |

- C4. Every bridge call catches its own failure and returns the safe value in the last column.
  - Every subscription returns its own unsubscribe.
  - The page never gets raw IPC.
  - The core checks the URLs it is asked to open (C6). It does not check the shape of settings patches, Maps data or journal lines, and does not check which frame is calling (Part 12).
- C5. Browser permissions are decided for both requests and checks. Granted:
  - writing to the clipboard (`clipboard-sanitized-write`), for the tutorial's copy;
  - opening an external protocol (`openExternal`), only for a URL that C6 allows.
  - Everything else is denied, among it media, geolocation, notifications, fullscreen, pointer lock, clipboard reading, display capture, file system, and any unknown name.
  - The user's own paste into a field needs no permission, and the app reads the clipboard in no other way.
- C6. Leaving the app. Every way a URL can leave the window goes through one allow-list:

  - a link click or navigation;
  - a new-window request (`target="_blank"`, `window.open`);
  - the bridge's `openExternal`;
  - Chromium's own external-protocol check.

  The allow-list:

  - `https:` to any host opens in the default browser.
  - `steam:` opens in the Steam client, only for the commands in C7.
  - Anything else is refused and logged: `http:`, `file:`, `ms-settings:`, `javascript:`, UNC paths, unparsable text.

- C7. The `steam://` commands. The scheme and the command ignore case; the rest is checked exactly as written, query included:

  | Command   | Allowed shape                                                                                                                                        | Used for                                                                     |
  | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
  | `run`     | `steam://run/730` or `steam://run/730/`, nothing after                                                                                               | launching CS2                                                                |
  | `rungame` | `steam://rungame/730/<SteamID64>/<token>`. The id is 17 digits; the token is `+gcconnect` followed by 1 to 64 of `A-Z a-z 0-9 : _ -`; nothing after. | joining a player's match                                                     |
  | `openurl` | `steam://openurl/` then an `https:` URL on `steamcommunity.com` or `steampowered.com`, or a subdomain of either                                      | the token page, the API key page, the privacy settings, the author's profile |
  | `url`     | `steam://url/<Name>(/<Name>)*`, with letters, digits, `_` and `-` only, and no query                                                                 | the user's own profile (`SteamIDMyProfile`)                                  |

  Refused: install, uninstall, settings, exit, any other game, any launch options, `http:` or another host inside `openurl`.

- C8. The window never navigates away. Every navigation is cancelled, and an allowed URL goes to the OS instead. Every new window is denied. A file dropped on the window does nothing, because `file:` is refused (_Inferred_).
- C9. Text from other Steam users (names, statuses, scores, avatars) is escaped before it enters markup. An ID is validated before it goes into a link.
- C10. The shipped program cannot be repurposed:
  - it does not run as plain Node;
  - it ignores `NODE_OPTIONS` and inspector arguments;
  - it checks the integrity of its packed app archive, and loads the app only from that archive.
  - Today these are Electron fuses. Their state, and the archive's integrity, were checked in the builds of 0.9.2 to 0.9.6 before release (auto-update).
- C11. Credentials stay on the PC: they are encrypted at rest (Part 7) and sent only to Steam's Web API.

**Edge cases**

- A refused URL is logged in full. A refused join URL holds a SteamID64 and a connect token (Part 12).
- In the hidden-window checks (live-app-checks), the permission path bypasses a patched shell call. So an allowed `steam://` link clicked in such a window could open Steam on the developer's PC. Any harness for the new app must block link clicks and deny permissions itself.

**Stored**

- Nothing beyond Chromium's own data.

**Why**

- Permissions: "Chromium grants a page every permission it asks for unless told otherwise; this page needs almost none of them".
- Schemes: "file:, ms-settings:, a UNC path - would let a link run local programs through the operating system".
- `steam://`: "The client's protocol does far more - run any game with any launch options, install, uninstall - and none of that may be reached through a link, whoever built it". The client's browser "is signed in to the user's account".
- The connect token's pattern keeps whitespace, quotes, percent escapes and further commands out of CS2's launch arguments.
- CHANGELOG 0.9.0 (Security): encrypted credentials, fuses, only the app's own `steam://` commands, denied permissions, restricted links, escaped player text. 0.9.2: images only from the app and Steam's avatar hosts.

**Code**

- Window and isolation: `src/main/main.js:99-111`. Navigation and new windows: `main.js:120-129`. Permissions: `main.js:131-141`, `src/main/permissions.js:3-22`.
- Allow-list: `src/main/external-links.js:3-83`, `main.js:67-79`, `main.js:240-248`, `src/game/steam-protocol.js:11-34`, `src/shared/constants.js:149-156`.
- Policy: `index.html:6-16`.
- Bridge: `src/main/preload.cjs:7-279`; core side `src/main/main.js:196-266`.
- Fuses: `package.json:61-67`.
- Escaping: `src/utils/dom-utils.js:40-59`, `src/ui/notification-manager.js:73-76`.
- _Test_:
  - `__tests__/content-security-policy.test.js`: "images load from the app, data: URLs and Steam's avatar hosts only", "a Steam avatar loads: %s", "any other host stays out: %s", "every remote image the page's own code names may load", "the policy names no navigate-to, which Chromium never shipped".
  - `__tests__/main-permissions.test.js`: "lets the page copy to the clipboard", "denies %s", "lets Chromium open only the links the app may open itself".
  - `__tests__/main-settings.test.js`: the two `isAllowedExternalUrl` tables.
  - `__tests__/update-bridge.test.js` and `__tests__/window-minimized-bridge.test.js`: the bridge's shape.
  - `__tests__/html-escaping.test.js`.

## 9. Logging

**Rules**

- G1. The page logger has five levels: error, warn, info, debug, trace. Its threshold is fixed at info in code: "The one knob: raised by hand for a debug build".
  - Each line reads `[YYYY-MM-DD HH:MM:SS] [LEVEL] [Context] message`, in UTC.
  - Lines go to the page console, with objects shown as tables.
  - Every logged line is also forwarded to the core: error, warn, info and debug as themselves, trace as debug.
- G2. The core logger writes `[ISO time] [MAIN] [LEVEL] message`, and a `Data:` line when there is data, to standard output.
  - Forwarded page lines appear there as `[Context] message`.
  - The updater's own messages go in with an `[updater]` prefix. Its debug messages are dropped.
- G3. The core and page logs are never written to a file. A packaged Windows app has no console, so in practice they are seen only when the app is started from a terminal or with developer tools open (_Inferred_; see Part 12).
- G4. What never goes into a log:
  - credentials: field names only;
  - the auth part of Steam request URLs, which is masked;
  - saved settings: a save logs only the key names, and the start logs only whether an id and a credential exist and how many friends.
- G5. High-frequency lines stay below info, so they do not cross into the core. Steam requests log at debug: "five a second during a join: at info each would also reach the main process over IPC".
- G6. The only log on disk is the join journal (`join-journal.log` in the data folder, moved to `.old` past 5 MB). It is specified with joins.

**Edge cases**

- A logged error object prints its stack in the page console. How much of it reaches the core's output was not checked.
- A bridge call that fails reports to the page console only; it is not forwarded.

**Stored**

- No log files besides the journal.

**Code**

- `src/main/main.js:26-55`, `main.js:250-265`.
- `src/main/app-updater.js:60-65`.
- `src/utils/logger.js:12-206`.
- `src/shared/constants.js:158-181`.
- `src/main/preload.cjs:82-91`.
- `src/steam/api-logger.js:18-29`.
- `src/main/settings-store.js:81`, `:118-139`, `:182-190`.
- `src/core/app.js:286-298`.
- `src/main/join-journal-file.js:11`, `:52-53`.

## 10. Updates

**What the user sees and can do**

- The app finds a newer version by itself: at start, every four hours, and at once when the user clicks the version in the footer.
- Everything about an update happens in the footer, to the left of the version. There is no window, no overlay, no release notes and no talk of versions beyond the number on offer.

| Phase       | When                                           | Text (en / ru)                                                                                                       | Links                                                                                                                       | Bar                                                                                                                    |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| available   | a version is on offer                          | Update {v} available / Доступно обновление {v}                                                                       | Install / Установить. Tooltip: "Downloads the update and restarts the app" / «Скачает обновление и перезапустит приложение» | none                                                                                                                   |
| confirm     | after Install                                  | Install update {v}? The app restarts / Установить обновление {v}? Приложение перезапустится (in primary text colour) | Yes / Да, No / Нет; the keyboard goes to No                                                                                 | none                                                                                                                   |
| downloading | after Yes, until the version is in             | Downloading update {v} / Скачивается обновление {v}                                                                  | none                                                                                                                        | 90 x 4 px, Steam blue on a 20% blue track, then "{a} of {b} MB" / «{a} из {b} МБ», or "{p}%" while the size is unknown |
| installing  | the version is in and the restart is asked for | Installing update {v} and restarting… / Установка обновления {v} и перезапуск… (green)                               | none                                                                                                                        | full, green                                                                                                            |
| failed      | the download broke off                         | Update {v} did not download / Обновление {v} не скачалось                                                            | Retry / Повторить                                                                                                           | none                                                                                                                   |
| ready       | downloaded but not installing                  | Update {v} downloaded / Обновление {v} скачано                                                                       | Install / Установить, which asks again                                                                                      | none                                                                                                                   |
| checking    | the user's click, until the answer             | Checking for updates… / Проверка обновлений…                                                                         | none                                                                                                                        | none                                                                                                                   |
| latest      | the answer, for 5 s                            | No updates available / Обновлений нет                                                                                | none                                                                                                                        | none                                                                                                                   |
| checkFailed | the answer, for 5 s                            | Couldn't check for updates / Не удалось проверить обновления                                                         | none                                                                                                                        | none                                                                                                                   |

- In every other case the notice is hidden: no version on offer, an automatic check running, or a development run.
- The version's tooltip is "Check for updates" / «Проверить обновления».

**Rules**

- U1. Only an installed build updates. A development run reports "off", checks nothing, and shows the version as a plain label.
- U2. The source is the GitHub releases of `<owner>/cs2-casual-enjoyer`, published ones only (no drafts, no pre-releases).
  - The build carries this setting: provider github, release type "release", cache folder `cs2-casual-enjoyer-updater`.
- U3. Checks run at start and then every 4 hours (`UPDATE_CHECK_INTERVAL_MS`), and at once on a click on the version.
- U4. No check runs while a version is on offer, downloading, or ready. A check asked for then answers "available" without asking GitHub.
- U5. A check asked for while one is running gets that check's answer, with no second request.
- U6. A check answers one of:
  - `available`: a version to offer, found now or before;
  - `latest`: nothing newer;
  - `failed`: no answer from GitHub, or the updater did not run;
  - `off`: a development run.
- U7. Nothing downloads without the user. Install asks first, in the footer.
  - Yes downloads the version and restarts into it as soon as it is in, with no second question.
  - Retry, after a download broke off, downloads again without asking.
- U8. The restart into a new version installs silently and starts the app again. An update never shows the installer's pages, and the shortcuts stay as they are.
- U9. A version downloaded but not installed goes in at the next normal quit, silently, and the app does not restart (W7).
- U10. The app never restarts on its own, so no join is cut short by surprise. Only the user's Yes restarts it.
- U11. The core keeps a status: `{state, version?, percent?, transferred?, total?, failed?}`.
  - `state` is one of off, idle, checking, available (with `failed` after a broken download), downloading, ready.
  - The core sends the status on every change, and answers it on request.
  - A status pushed to the page before the page's own request is answered wins over that answer.
- U12. Progress percent is rounded down. Bytes come only once the total is known and above zero.
  - The footer shows bytes as `transferred` and `total` divided by 1,048,576 and rounded, labelled "MB", or the percent until then.
- U13. Errors:
  - during a download: the version is offered again with `failed`. This is logged once, although the update library reports it twice (an error event and a rejected download).
  - during a check: a warning in the log, and back to idle. The user sees nothing of an automatic check.
  - after the download: the install stays on offer.
- U14. The question:
  - the keyboard goes to No, so an Enter right after the click lands on No;
  - No or Escape goes back to the offer, with the keyboard on Install;
  - the second click of a double click on Install is not a Yes.
- U15. An offer that goes away takes its question with it.
- U16. The user's check:
  - "Checking for updates…" shows until the answer, and a second click meanwhile does nothing;
  - then "No updates available" or "Couldn't check for updates" shows for 5 s (`CHECK_ANSWER_MS`);
  - a version found shows as the offer;
  - after a failure, another click tries again.
- U17. A language switch keeps the phase and renders it in the new language.
- U18. Release files, all three attached to a published GitHub release tagged `v<version>`:

  - `Casual-Enjoyer-Setup-<version>.exe`;
  - its `.blockmap`, which lets the updater fetch only changed blocks;
  - `latest.yml`:

  ```yaml
  version: <version>
  files:
    - url: Casual-Enjoyer-Setup-<version>.exe
      sha512: <base64>
      size: <bytes>
  path: Casual-Enjoyer-Setup-<version>.exe
  sha512: <base64>
  releaseDate: "<ISO time>"
  ```

  Release steps (README): raise `version` in package.json, run `npm run dist`, publish the release with the three files.

- U19. Release order matters. The updater takes the newest non-prerelease entry of the releases feed, ordered by creation, so a release created after a newer one hides it.
- U20. Each version updates through its own footer, so a new flow shows only from the update after the release that ships it:
  - up to 0.9.2: downloads by itself, then "ready, restart";
  - 0.9.3 and 0.9.4: a click downloads, a second click installs;
  - 0.9.5: the question in the footer;
  - from 0.9.6: the version click.

**Edge cases**

- A download that could not start puts the offer back.
- An install the core turns down shows "Update {v} downloaded" with Install, which asks again.
- The same "ready" arriving twice installs once.
- After a page reload during a download, the page no longer knows the user said Yes, and "ready" then waits for another Install (_Inferred_).
- A newer release published while a version is on offer is not seen until the app restarts, because U4 holds off every check (Part 12).

**Stored**

- The status lives in memory only.
- Downloads go to `%LOCALAPPDATA%\cs2-casual-enjoyer-updater\pending` (_Measured_ 2026-11-06, read-only look).

**Why**

- _User decisions_ (auto-update):
  - 2026-11-06: updates as in Discord, «Да, как Discord».
  - 2026-11-06: offer, don't download at once: «человек кликает, загружает, а потом предлагается там же в строке установка». Shipped in 0.9.3.
  - 2026-11-06: a large dialog with release notes, a version comparison and "Updated to X" was rejected: «не нужен вот этот ченджлог и слова о том какая у вас версия».
  - 2026-11-07: no update window at all: «не надо никакое окошко обновления, сделай все в подвале, там же и уведомление, там клик с подтверждением, там же и статус бар скачивания». Shipped in 0.9.5.
  - **Declined**: an update window or overlay, release notes in the UI, talk of versions.
- The version click (0.9.6): the user's 0.9.4 never offered 0.9.5. It had started at 00:28 Moscow time, 0.9.5 came out at 00:38, and its next check fell 4 hours later.
- Four hours: "The app tends to stay open all evening, so a release made meanwhile should still reach the user before the next start, and a few checks a day are nothing to GitHub's public API."
- Yes before the download, so "the user picks the moment for a download that can run past 100 MB".
- _Measured_:
  - 0.9.0 to 0.9.1 worked end to end on 2026-11-06 («работает»).
  - Each release from 0.9.1 on was checked as served: the latest.yml at the "latest" download link named it.
  - From 0.9.4 on, the served latest.yml's sha512 also matched the local installer, or a full download of it (0.9.7).
  - The 0.9.7 installer is 116,098,843 bytes and its blockmap 121,482 bytes (files on disk, 2026-11-07).
- Difference from the notes: auto-update first describes a footer that showed "Загружается обновление X… N%" and later "Доступно обновление X — загрузить". Both are superseded; the table above is the code at 0.9.7.

**Code**

- Updater: `src/main/app-updater.js:1-27` (contract), `:51-104` (start, events, timer), `:115-139` (check), `:154-178` (download, install), `:194-213`.
- Core wiring: `src/main/main.js:209-214`, `:279-289`, `:335`, `:356`. Bridge: `src/main/preload.cjs:117-175`.
- Footer: `src/ui/update-notice.js:6-12` (constants), `:46-74`, `:79-135` (render), `:142-158` (phases), `:177-192` (the click check), `:201-211` (size), `:219-305`; `index.html:280-292`; `css/layout.css:80-156`.
- Texts: `src/i18n/locales/en.js:298-316`, `src/i18n/locales/ru.js:303-321`.
- Source: `package.json:69-74`. Release steps: `README.md:50-54`.
- _Test_:
  - `__tests__/app-updater.test.js`:
    - "a development run neither checks, downloads nor installs";
    - "an installed build checks at start and then on its interval, and downloads nothing by itself";
    - "a new version is offered and waits for the user's click";
    - "a click downloads the offered version, reported until it is ready";
    - "the download's progress carries its sizes once the updater knows them";
    - "a download that breaks off offers the version again, and a click retries it";
    - "a download rejected without an error event is offered again too";
    - "it restarts into the new version only when asked, and only once it is downloaded";
    - "no new check runs while a version downloads or waits to be installed";
    - "a failed check is logged, changes nothing for the user, and the next check runs";
    - "an error after the download leaves the install on offer";
    - "a check that throws is logged rather than left unhandled";
    - "a check asked for says what it found: none newer, no answer, or a version";
    - "a check asked for while one runs gets that one's answer".
  - `__tests__/update-notice.test.js`:
    - "says nothing while there is no new version";
    - "offers a new version with an Install link";
    - "Install asks first, in the footer, and downloads nothing yet";
    - "No, or Escape, goes back to the offer";
    - "the second click of a double click on Install is no Yes";
    - "Yes downloads the version, the bar showing the megabytes in";
    - "once the version is in, the app restarts into it at once";
    - "a download that broke off offers Retry, which downloads again without asking";
    - "a download that could not start puts the offer back";
    - "an install the main process turns down offers Install again, and asks again";
    - "an offer that goes away takes its question along";
    - "a version found before the notice was there is offered at the start";
    - "a click on the version checks at once, and says for a moment when nothing is newer";
    - "a check GitHub did not answer says so, and another click tries again";
    - "a check that finds a version offers it";
    - "the version's title follows the language".
  - `__tests__/update-bridge.test.js`: all five tests.

## 11. Installer and packaging

**Rules**

- P1. A Windows installer, not one-click. Its pages:
  1. install mode: for the current user (the default) or for everyone, which asks for elevation;
  2. the folder;
  3. shortcuts: desktop and Start menu, both checked;
  4. installing;
  5. finish, with "run".
  - Installing for oneself needs no administrator rights.
- P2. The installer's language follows the system's, Russian or English, with no language picker. The shortcuts page is Russian for language id 1049 and English otherwise.
- P3. The shortcuts page applies to a fresh install only.
  - An unchecked shortcut is removed after the install has made both.
  - If the Start menu shortcut goes, the finish page starts the program directly.
  - Updates never show the pages and keep the shortcuts as they are.
- P4. Names:
  - installer `Casual-Enjoyer-Setup-<version>.exe`;
  - program `Casual-Enjoyer.exe`;
  - shortcuts "Casual Enjoyer";
  - uninstall entry "Casual-Enjoyer", under HKCU for a per-user install (_Measured_ 2026-11-06);
  - app id `cs2casualenjoyer`.
- P5. Uninstalling keeps the app's data folder (`%APPDATA%\cs2-casual-enjoyer`), with the settings, the key file and the journal.
  - In electron-builder 26 the assisted uninstaller removes that folder only when run with `--delete-app-data`. `deleteAppDataOnUninstall: false` is a one-click-only option, so it changes nothing here.
- P6. The installer and the program are unsigned.
  - SmartScreen warns on the first install. README: "More info", then "Run anyway".
  - With no publisher configured, the updater skips its signature check, so an update is verified only against the sha512 in latest.yml.
  - Code signing was declined: this comes from this task's brief, and the notes I read give no date for it.
- P7. Contents: `src/`, `index.html`, `css/` and `assets/`, packed in one archive whose integrity is checked (C10), with maximum compression.
  - The only runtime dependency is the update library.
  - With Electron 45 the installer is about 116 MB.
- P8. There is no portable build, because the update library cannot update a portable exe. Users of the old portable versions need the installer once.
- P9. Build notes:
  - the include file lives in `installer/` because `build/` is git-ignored;
  - all of it sits under `!ifndef BUILD_UNINSTALLER`, because makensis runs with warnings as errors and unused variables would fail the uninstaller;
  - the file is UTF-8, which works because the build passes `-INPUTCHARSET UTF8`.

**Stored**

- The program folder, the shortcuts and the uninstall entry.
- The default per-user folder is `%LOCALAPPDATA%\Programs\cs2-casual-enjoyer`. This is where 0.9.0's one-click install went (_Measured_ 2026-11-06).
  - A read-only look later that day found the user's install elsewhere, and its uninstall entry had no InstallLocation. Unsettled.

**Why**

- _User decision_ 2026-11-06: installer pages for windows and shortcut choices (0.9.1).
- The installer must need nothing beyond itself. Players are asked for nothing but the token or key (no-extra-setup, recorded by 2026-10-30), and the app writes its GSI config by itself.
- Difference from the notes: auto-update first calls the installer "one-click per-user". The code has been assisted since 0.9.1, and the code wins.

**Code**

- `package.json:29-75` (nsis `:43-58`, fuses `:61-67`, publish `:69-74`).
- `installer/installer.nsh:1-73`.
- `README.md:7-11`.

## 12. Smells and open questions

**Settings**

- A read failure turns into data loss. Any failure to read settings.json other than "no file" reads as "no settings": broken JSON, a file locked by an antivirus or a backup tool. That shows the first-start tutorial, and the next patch writes a file holding only that patch.
  - The rewrite should keep the unreadable file, never write over it on a failed read, and write atomically (a temporary file, then a rename).
  - Reads are also not queued behind writes.
- No schema, anywhere:
  - The core accepts any patch keys and values.
  - The `AppSettings` type in `src/shared/types.js:137-142` lists 3 of the 7 fields.
  - `tutorial_done` appears in a test but in no code.
- The first start is defined by the settings file's absence. So a user who skips the tutorial without saving anything sees it again, and a broken file brings it back.

**Languages**

- The language is stored twice: settings.json `language` and local storage `app_language`, each written at different moments (I3).
- Settings are loaded twice at start (`src/core/app.js:156`, `src/core/app.js:285`).
- The DOM pass runs twice per switch, as a listener and again explicitly (`src/i18n/dom-i18n.js:72-84`).
- The DOM pass's `html` target and `data-i18n-params` are unused by the page.
- `t()` returns an empty text for a missing key, and no test checks that the two locales hold the same keys.
- Four keys appear unused: `index.apiTokenKeyLabel`, `index.apiTokenKeyTitle`, `friends.temporarilyNotSupported`, `mapFinder.fofTitle`.
- "An unknown error occurred" is hard-coded English (`src/utils/error-handler.js:63`).
- Number and date formats are spread over three views (I8).
- The page has no `lang` attribute and no `<meta charset>`. Its only non-ASCII characters are three icon alt texts.
- Texts disagree with the UI:
  - the privacy note says "Update Friend List" («Обновить список друзей»), but the button reads "Load friends";
  - the SteamID64 link's tooltip says "Open your profile in Steam", but a click opens the SteamID help card;
  - the key help says to click "the SteamID64 field label".

**Tutorial**

- The 1.2 s steps of the made-up connection are hard-coded outside `TUTORIAL_TIMING` (`tutorial-mock-data-manager.js:170-174`).
- The comment "force position above" for step 9 does not match the call, which forces nothing (`tutorial-manager.js:166-171`).
- Join interception covers every row, not only the made-up friend's, and does nothing on steps 1 to 6.
- The made-up data manager hides whatever card is open.
- Step 3 opens the help only when no card is shown.
- Enter, Backspace and Esc are captured for the whole document.
- The steps carry inline style attributes, which keep `'unsafe-inline'` in the policy.
- The "tutorial running" guard is repeated in five places in `app-friends-manager.js`.
- Copying the releases link, instead of opening it, has no recorded reason.
- Undecided for 1.0: should the tutorial be remembered as seen?

**Window and process**

- No single-instance lock. Two instances would mean two GSI listeners, two updaters and two writers of the same settings file.
- No crash or hang handler for the page.
- No window bounds memory. Is that wanted?
- Nothing is flushed on quit (Part 1, edge cases).
- Electron's default menu is only hidden, so whether reload and developer tools work in the shipped build is unknown. A reload is a real path in the code, and joins of the same account survive a friends reload; whether a page reload must keep running joins is undecided.
- Whether a double-click on the title bar maximizes was not checked.
- `steam-log-cs2` names both an invoke handler and an event.
- The version reads "vunknown" when the core cannot give it.

**Logging**

- Core and forwarded page logs go only to standard output, which a packaged app does not have. Production logs are effectively lost, yet every info line still crosses the bridge.
- A refused URL is logged in full, including a SteamID64 and a connect token.
- The rewrite needs a decision: a rotating log file with redaction, or no forwarding.

**Updates**

- `check()` joins a running check only after the update library has announced it. A click in the moment between the call and the announcement would start a second request; the footer's own guard covers the click, but not the timer.
- A version on offer stops all checks (U4). A release published after the offer is missed until a restart, and the user may first install the older version.
- The user can say Yes during a join, and the app restarts mid-join with no warning. Decide whether to warn, or to wait for the join.
- "MB" here are MiB: the 0.9.7 installer of 116,098,843 bytes would read "of 111 MB".
- Bridge to 1.0 (v1-rewrite-plan): the last 0.9 release must move users to 1.0's updater. 0.9 reads only `latest.yml` and an NSIS setup exe from the GitHub releases, and installs silently with a forced restart. How a Tauri 1.0 is delivered through that path, and how its own updater (Tauri's signed manifest) takes over, is open.

**Installer**

- Three names for one app:
  - `cs2-casual-enjoyer`: the package name, used for the data folder, the install folder and the updater cache;
  - `Casual-Enjoyer`: the product name, used for the exe and the uninstall entry;
  - "Casual Enjoyer": the shortcuts and the title.
  - The app id is `cs2casualenjoyer`. 1.0 must still find 0.9's data in `%APPDATA%\cs2-casual-enjoyer`.
- `deleteAppDataOnUninstall: false` has no effect on this assisted installer (P5).
- The uninstaller leaves the GSI config in CS2's folder. Covered by the GSI spec; is that intended?
- Unsigned: the decision is recorded in this task's brief, without a date.
  - SmartScreen judges an unsigned file by that file's own reputation, so each new installer may warn again on a fresh install. This is general behaviour, not measured here.
  - Updates download without a browser, so they should not meet SmartScreen (_Inferred_).

**Visual and markup**

- 24 of the 106 tokens in `css/variables.css` are unused, among them `--gray-100` to `--gray-800` (except 600), `--blue-dark`, `--panel-bg-gradient`, `--shadow-dark`, `--z-base` and `--z-dropdown`.
- Five tokens and three literal hex values are not Steam colours (V1), against the user's rule.
- Font sizes mix em tokens (`--font-size-*`) with px literals (13 px appears 14 times).
- `.gsi-status` declares `gap` twice (`css/gsi-status.css:6`, `css/gsi-status.css:9`).
- Utility and other classes no page or script names: `mb-*` except `mb-sm`, `flex-*`, `center-row`, `link-underline`, `param-link`, `form-element`, `section-spacing`, `underline`, `window-bar-title-container`.
- `css/responsive.css` has Russian comments.
- Icons are tinted two ways: CSS filter chains that approximate the greys, and masks in the current colour.
- The views are not marked as tab panels, and the tabs have no arrow-key navigation.
- Licence: Motiva Sans ships at the user's request (2026-11-06), after the user was told that an app or embedding licence would be needed. Whether 1.0 ships it is a decision to take again knowingly.

**Security**

- `https:` to any host is allowed out to the browser. The app itself links only to GitHub. Narrow it?
- The core does not check payloads or the calling frame (C4).
- Credentials cross the bridge in plain text and sit in the page's field. In a design with a Rust core, they could stay in the core, with the page seeing only "set" or "not set".

**Not settled here**

- Whether values written by the asynchronous encryption calls (0.9.2 and later) keep the "v10" layout measured on 2026-11-04 for older values.
- Whether a `steam://` link click passes through navigation, through the external-protocol permission, or both. The allow-list guards both paths, so either is safe.
- Where the user's install actually is (Part 11, Stored).
- For the rewrite's own checks (live-app-checks): a development window steals focus from a running game, and the development app writes the user's real settings. The new app should allow an overridden data folder and a hidden or offscreen run, and its checks must block `steam://` link clicks and never touch the clipboard.
