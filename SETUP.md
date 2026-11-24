# Setup guide — Fight On A Baseplate v3

Your Supabase keys (project `peztvgqqsffcztdfqchx`) are already in `js/config.js`. Only these steps are left.

## Step 1 — Turn off email confirmation (1 minute)
Supabase → your project → **Authentication** → **Sign In / Providers** → **Email** → switch **"Confirm email" OFF** → **Save**.
(Accounts use a username + password. There's no real email, so nothing can be confirmed.)

## Step 2 — Create the database (2 minutes)
1. Supabase → **SQL Editor** → **New query**.
2. Open `supabase/setup.sql` from the zip, copy **all** of it, and paste it in.
3. Click **Run**. It should say *Success. No rows returned*.
   (You can run it again later; it keeps your data.)

## Step 3 — Upload the game to GitHub
Upload everything from the zip to your repo, keeping the folders: `index.html`, `css/`, `js/`, `supabase/`, and the README files.
Replace the old files when GitHub asks. Then open your GitHub Pages link.

## Step 4 — Make yourself admin
1. In the game, choose **Create account** and make your account.
2. Back in Supabase → **SQL Editor** → **New query**, paste this line with your username in it, and click **Run**:
   ```sql
   update public.profiles set is_admin = true where lower(username) = lower('YourUsername');
   ```
3. Refresh the game. A 🛠️ **Admin** button appears on the right side of the lobby.

## Using the admin panel
- **Search** for a player by username and click them.
- **Reset password:** type a new password → **SET**. Then tell the player their username and the new password, and they're back in with all their progress.
- **Coins / XP:** add (or subtract, using a minus number) coins or XP.
- **Give kit:** unlock any kit for them for free.
- **Rename:** changes their username. It's also their login name, so tell them the new one.
- **Ban / Unban** and **Make admin / Remove admin**.

## How progress works
- **XP comes from playing, not winning.** You get XP for time played, kills, final kills, beds broken, blocks placed and arrows hit.
- **Multipliers:** Easy bots ×0.5, Normal ×1, Hard ×1.6, and multiplayer/Quick Play ×1.3.
- **Coins** are about 60% of your XP, plus a small bonus for winning. Spend them on **kits** (🎒 button).
- Some kits also need a **minimum level**.
- **Missions:** 3 daily (reset at midnight UTC) and 3 weekly (reset every Monday, UTC). They update after every match of 45 seconds or longer. Claim the rewards in 📜 Missions.
- **Guests** can play everything, but nothing is saved.
- All the rules live in the database, not in the browser, so players can't just edit their coins. Match results are checked too (caps on kills per minute, no more playtime than real time has passed, one match every 30 seconds).

## Changing prices or adding kits/missions
- **Kit prices and levels** are in two places that must match: `js/config.js` (the `KITS` list) and the `insert into public.kits` part of `setup.sql`. Edit both, upload, and re-run the SQL.
- **Missions:** edit the `insert into public.missions` list in `setup.sql` and re-run it.

## If something goes wrong
- **"Turn OFF Confirm email"** error when signing up → do Step 1.
- **"profile is missing"** → Step 2 wasn't run (or it hit an error). Run `setup.sql` again.
- **The lobby says OFFLINE** → your network is blocking `cdn.jsdelivr.net` or Supabase. Try another network or turn off your VPN or ad-blocker.
- Press **F12 → Console** and send the red lines to get help.
