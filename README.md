# Fight On A Baseplate — BedWars (v4)

**First time? Read `SETUP.md`.** It covers turning off email confirmation, running the database script, and making yourself admin.

## New in v4
- **Locker (🎨):** hats and outfits, bed designs, kill effects, name colours and emotes, all bought with coins.
- **Emotes:** press **X** for the emote wheel. Other players can see your emotes in the lobby and in matches.
- **4 maps:** Classic Islands, Frostbite (snow), Desert Ruins and Nether (lava). In a party everyone votes; in Solo you pick one or go random.
- **New items:** Shears (wool breaks about 7× faster), Axe (wood breaks 3.5× faster), Balloons (pack of 3), and Sharpened Swords II and III.
- **Balloons:** use them while falling. 3 balloons float you up, 2 make you sink slowly, 1 sinks faster. Every arrow that hits you pops one.
- **Ranked (🏅):** real players only, Elo rating, ranks from Bronze to Diamond, plus a rating leaderboard.
- **Polish:** mini-map, footsteps and landing sounds, loading and match tips, spectator camera after you're eliminated, and an MVP podium at the end.
- The death screen says **"Killed by (username)"**, or "Shot by", "Knocked into the void by" and so on.

## New in v3
- **Accounts** (username + password, no email needed). Your levels, XP, coins, kits, stats and missions are saved, and you stay logged in on your device.
- **XP and levels** from playing (time, kills, finals, beds, blocks, arrows), with bigger multipliers for harder bots and for multiplayer.
- **Coins and 9 kits** with abilities: Builder, Archer, Miner, Medic, Tank, Bomber, Ninja and Vampire.
- **Daily and weekly missions** with XP and coin rewards.
- **Profile** with full stats and match history. **Leaderboards** (all-time and weekly), plus a 3D top-players board in the lobby.
- **Quick Play** matchmaking, **public parties** and **friends**, with invites straight into your party.
- **Admin panel:** reset passwords, give coins/XP/kits, rename, ban, make admins.
- Guests can still play, but nothing is saved.

A Roblox-BedWars-style game that runs in the browser. Three.js draws the game and Supabase Realtime handles multiplayer.

## What's in it
- **Hub lobby.** Everyone online spawns on a floating plaza and can see each other walking around. There's chat, and two portals: **Solo vs Bots** and **Multiplayer**.
- **Solo vs Bots.** Choose Easy, Normal or Hard bots and a match type: 1v1, Solos (4 teams) or Duos (you get a bot teammate). Solo works offline.
- **Multiplayer parties.** Create a party code and friends join with it. Players can click a team to switch. The host picks Solos or Duos and whether bots fill the empty slots. If the host leaves mid-match, another player takes over the bots.
- **Inventory.** A 9-slot hotbar (keys 1–9) plus a 27-slot backpack (E). Click one item, then another slot, to swap them.
- **Item shop** with tabs: Blocks, Combat, Armor, Tools, Ranged and Utility (golden apple, fireball, TNT, telepearl, speed and jump potions).
- **Team upgrades** paid with diamonds: Sharpness, Protection, Haste, Forge, Heal Pool and Alarm Trap. They apply to the whole team.
- **Real block collision.** You can stand on, jump on and bump into everything. Blocks: wool, planks, stone brick and obsidian, each slower to break than the last. Pickaxes break blocks faster.
- **Building.** Bridge by looking down past the edge and holding right-click. Pillar up by jumping while looking straight down.
- **Beds.** Each bed takes 2 blocks and has to be mined. Once your bed is gone you can't respawn. The last team left wins, and a victory screen shows everyone's stats.
- **Bots** gather iron, shop, wall in their bed, bridge in straight lines, mine through defences, fight, eat golden apples, and walk back along their own bridges.
- **Sound effects** made in code (no audio files), particles, screen shake, a hurt flash, a low-health warning, and a first-person held item.

## Controls
WASD move • Space jump • **Shift** crouch (won't fall off edges) • Click to lock the mouse (Esc to unlock) • 1–9 hotbar • **E** inventory • **F** shop / interact • Left click attack / use / mine (hold) • Right click place blocks • **V** first person • Scroll to zoom • **T** chat • **Tab** scoreboard • **M** mute • **B** fullscreen

## Files
```
index.html        page + all the menus/HUD
css/style.css     styling
js/config.js      ← Supabase keys, teams, items, prices, upgrades, bot difficulty (tweak here)
js/main.js        startup + game loop (fixed 60 updates/second, the same speed on every monitor)
js/engine.js      renderer, sky, clouds, pixel textures, particles
js/avatar.js      the blocky characters + held items
js/grid.js        block grid, collision lookups, ray casting
js/physics.js     movement + collision
js/entity.js      players/bots + inventory data
js/player.js      your controls, camera, building/mining/attacking
js/combat.js      damage, kills, arrows, fireballs, TNT, telepearls, explosions
js/actions.js     placing/breaking blocks and beds (synced)
js/shop.js        item shop + team upgrades
js/invui.js       hotbar + inventory screen
js/bots.js        bot AI
js/maps.js        match map + hub map
js/match.js       match flow, generators, respawns, win screen, multiplayer sync
js/hub.js         hub lobby, menus, party screen, settings
js/net.js         Supabase Realtime (hub presence, parties, Quick Play, invites)
js/account.js     accounts, profile, XP/coins, kits, missions, friends, admin calls
js/fx.js          kill effects
js/menus.js       all lobby menus (incl. Locker, Ranked, map voting) (play, party, kits, missions, profile, leaderboards, friends, settings, admin)
supabase/setup.sql  the database: tables, security rules, and all the server-side rules
js/ui.js, js/audio.js   small helpers
```

## Putting it on GitHub Pages
1. Upload **everything**, keeping the folders (`index.html`, `css/`, `js/`) at the top level of the repo.
2. Go to Settings → Pages → Deploy from a branch → `main` / root.
3. Open the `github.io` link.

The game won't run if you just double-click `index.html`, because browsers block JavaScript modules on `file://`. To test on your own computer, run a local server in the folder (for example `npx serve` or `python -m http.server`) and open the address it shows.

Vercel works too: import the repo as a static site, with no build step.

## Supabase
- Realtime is used for the lobby and matches. The database (from `setup.sql`) stores accounts and progress.
- The URL and anon key are in `js/config.js`. The anon key is public by design. Never put the `service_role` key here.
- If your project has *Realtime → "Private channels only"* switched on, turn it off. This game uses public channels.
- Free-plan Realtime has message-rate limits. Each player sends about 9 updates a second, and the host sends bot updates about 7 times a second. 2–4 players should be fine. If big matches start to stutter, that limit is the likely cause.

## Next ideas
- Cosmetics (skins, bed designs, kill effects) bought with coins
- More maps and items (shears, axes, balloons)
- Mobile touch controls
