# 08. Coplay candidates (new in 1.0)

A pool source decided on 2026-11-07, to be built in 1.0 only. It takes players of the user's own casual matches from Steam's "recently played with" list. Today the pool gets them only from GSI, which seldom lists more than one.

## Why

- The pool holds only players of the user's own casual matches (the rule of 2026-11-07, see [04](04-maps.md)). Its only source now is GSI's seeds: the player the user spectates, or everyone, when CS2 lists them.
- CS2 listed everyone rarely. In the tests of 2026-10-25 to 10-30 the full list came only in warmup and in free spectating: 19 players for about 3 s on 10-25, and 12 to 16 and 10 players in warmups on 10-29 and 10-30. While the user spectated teammates after death, it never came.
- Steam itself keeps the players the user has just played with, in a file it writes with no setup. On 2026-11-05/06 it held groups of 6 to 16 players, written when the user left a server.

## Steam's coplay file

- **Path**: `<Steam>\config\coplay_<the user's SteamID64>.vdf`, where `<Steam>` is the Steam folder found as in [05](05-cs2-gsi-and-local-steam.md).
- **Format**: binary KeyValues, read 2026-11-07 from the owner's file of 5200 bytes:

  - type `0x00` opens a subsection and type `0x08` ends one;
  - type `0x07` is a uint64 (8 bytes little-endian), type `0x02` an int32 (4 bytes little-endian);
  - each type byte is followed by a NUL-terminated key, then the value.

  ```
  0x00 "coplay"
    0x00 "0" .. "99"                  one subsection per player, 100 at most
      0x07 "SteamID"   uint64         the player's SteamID64
      0x07 "gameid"    uint64         730 for CS2
      0x02 "Playtime"  int32          Unix seconds: when the user last played with them
    0x08
  0x08
  ```

  The tree fills the whole file. Expect other games' entries (another `gameid`) and fewer than 100 entries.

- **Content**: only the SteamID, the game and a time. There is no mode, map or server. Steam keeps the latest time per player.
- **When times are set**, from the join journal on 2026-11-05/06:

  - groups share a time at the moment the user left a server: GSI "playing" turning into "menu" at 23:30:17 (13 players), 00:24:10 (6) and 01:00:56 (7, CS2 closing);
  - two groups (16 and 15 players) came 1 to 2 s after a connect sent while the user played, that is, while CS2 was leaving the old server;
  - single entries during play are probably players leaving.

  An early reading of "the whole server, 1 to 2 s after a join" was wrong. The times mark leaving.

- **When the file is written is unknown.** On 2026-11-06 it was last written at 01:01:45, 38 s after CS2's process ended (01:01:07 in Steam's game log). Steam may write it on each leave, or only after the game.
- 25 of the 100 players were already in the pool on 2026-11-06, under the old pool rule.

## Behaviour to build

1. **Notice changes.** Look at the file's size and time as the Steam game log reader looks at its log: Windows sends no events for files Steam keeps open, and the look costs one stat. Read the file when it changes.
2. **Tie entries to the user's matches.** The file carries no mode, so the app attributes each entry by its time.
   - The app keeps, for the current run, the user's matches as GSI reported them: start, end, mode, map.
   - An entry counts when its `Playtime` falls at the end of a casual match the user left, within the seconds the journal showed. The exact tolerance is to be set from measurements, not guessed.
   - Entries from other modes, from before the app ran, or that match no known match are ignored.
   - The user and their friends are left out.
3. **Candidates, not pool members.** A coplay player may have left by the time the file is read, and may hide their game details, which would keep them out of every answer. So each new player becomes a candidate for a day.
   - Candidates are polled with the Maps rounds: 100 ids cost one request.
   - A candidate whom Steam shows on an official server within the day joins the pool, as a seed does now, and is no longer a candidate.
   - A candidate never seen is dropped after the day.
4. **Store** the candidates with the time they were found, in the map finder's store, so a restart keeps them.
5. **Journal** each read: how many entries, how many tied to a casual match, how many became candidates, and later how many joined the pool. This settles when Steam writes the file and how well the source pays.

## Open checks

- When Steam writes the file. Watch its time during the owner's next session; the journal records of step 5 will show it.
- How many coplay players turn out visible, measured against the October figure of at most 3 of 19.
- Whether a party's members, who left together with the user, should be treated differently. Unknown; measure first.
