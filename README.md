# Fight On A Baseplate — BedWars (v2, Stage 1)

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
js/net.js         Supabase Realtime (hub presence, parties, match messages)
js/ui.js, js/audio.js   small helpers
```

## Putting it on GitHub Pages
1. Upload **everything**, keeping the folders (`index.html`, `css/`, `js/`) at the top level of the repo.
2. Go to Settings → Pages → Deploy from a branch → `main` / root.
3. Open the `github.io` link.

The game won't run if you just double-click `index.html`, because browsers block JavaScript modules on `file://`. To test on your own computer, run a local server in the folder (for example `npx serve` or `python -m http.server`) and open the address it shows.

Vercel works too: import the repo as a static site, with no build step.

## Supabase
- It only uses **Realtime Broadcast + Presence**. There are no tables and no SQL.
- The URL and anon key are in `js/config.js`. The anon key is public by design. Never put the `service_role` key here.
- If your project has *Realtime → "Private channels only"* switched on, turn it off. This game uses public channels.
- Free-plan Realtime has message-rate limits. Each player sends about 9 updates a second, and the host sends bot updates about 7 times a second. 2–4 players should be fine. If big matches start to stutter, that limit is the likely cause.

## Next stages (planned)
- Kits (like Roblox BedWars), cosmetics and skins
- Leaderboards and saved stats (this would use Supabase tables)
- More maps, sudden death, more items (shears, wood axe, balloons)
- Mobile touch controls
