-- =====================================================================
--  Fight On A Baseplate — database setup
--  Paste this whole file into Supabase → SQL Editor → New query → Run.
--  Safe to run again later (it updates functions and keeps your data).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null,
  created_at   timestamptz not null default now(),
  is_admin     boolean not null default false,
  banned       boolean not null default false,
  xp           integer not null default 0,
  level        integer not null default 1,
  coins        integer not null default 0,
  kits         text[]  not null default array['default','builder'],
  kit          text    not null default 'default',
  games        integer not null default 0,
  wins         integer not null default 0,
  kills        integer not null default 0,
  finals       integer not null default 0,
  beds         integer not null default 0,
  deaths       integer not null default 0,
  blocks       integer not null default 0,
  play_seconds integer not null default 0,
  last_submit  timestamptz
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

create table if not exists public.match_results (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  mode       text not null,          -- solo | mp | quick
  diff       text,                   -- easy | normal | hard (solo only)
  won        boolean not null default false,
  kills int not null default 0, finals int not null default 0, beds int not null default 0,
  deaths int not null default 0, blocks int not null default 0, arrows int not null default 0,
  seconds int not null default 0, xp int not null default 0, coins int not null default 0
);
create index if not exists match_results_user on public.match_results (user_id, created_at desc);
create index if not exists match_results_time on public.match_results (created_at);

create table if not exists public.kits (
  id text primary key, price int not null, min_level int not null
);
insert into public.kits (id, price, min_level) values
  ('default',0,1),('builder',0,1),('archer',400,2),('miner',400,3),('medic',700,5),
  ('tank',900,7),('bomber',1200,9),('ninja',1500,12),('vampire',2200,15)
on conflict (id) do update set price = excluded.price, min_level = excluded.min_level;

create table if not exists public.missions (
  id text primary key, period text not null check (period in ('daily','weekly')),
  stat text not null, goal int not null, reward_xp int not null, reward_coins int not null, title text not null
);
insert into public.missions (id, period, stat, goal, reward_xp, reward_coins, title) values
  ('d_kills',   'daily','kills',   8,  60, 40,'Get 8 kills'),
  ('d_finals',  'daily','finals',  3,  80, 50,'Get 3 final kills'),
  ('d_beds',    'daily','beds',    1,  80, 50,'Break a bed'),
  ('d_games',   'daily','games',   3,  60, 40,'Play 3 matches'),
  ('d_blocks',  'daily','blocks',  150,50, 30,'Place 150 blocks'),
  ('d_hard',    'daily','hard',    1,  70, 50,'Play a match vs Hard bots'),
  ('d_mp',      'daily','mp',      1,  70, 50,'Play a multiplayer match'),
  ('d_arrows',  'daily','arrows',  6,  60, 40,'Hit 6 arrows'),
  ('d_minutes', 'daily','minutes', 20, 60, 40,'Play for 20 minutes'),
  ('w_kills',   'weekly','kills',  60, 300,200,'Get 60 kills'),
  ('w_finals',  'weekly','finals', 20, 350,250,'Get 20 final kills'),
  ('w_beds',    'weekly','beds',   10, 350,250,'Break 10 beds'),
  ('w_games',   'weekly','games',  20, 300,200,'Play 20 matches'),
  ('w_blocks',  'weekly','blocks', 1500,250,150,'Place 1500 blocks'),
  ('w_hard',    'weekly','hard',   6,  350,250,'Play 6 matches vs Hard bots'),
  ('w_wins',    'weekly','wins',   5,  300,200,'Win 5 matches'),
  ('w_mp',      'weekly','mp',     6,  350,250,'Play 6 multiplayer matches'),
  ('w_minutes', 'weekly','minutes',150,300,200,'Play for 150 minutes')
on conflict (id) do update set stat=excluded.stat, goal=excluded.goal, reward_xp=excluded.reward_xp, reward_coins=excluded.reward_coins, title=excluded.title, period=excluded.period;

create table if not exists public.mission_progress (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  period_key text not null,            -- e.g. d:2026-11-24 or w:2026-11-23
  mission  text not null references public.missions(id) on delete cascade,
  progress int not null default 0,
  claimed  boolean not null default false,
  primary key (user_id, period_key, mission)
);

create table if not exists public.friends (
  a uuid not null references public.profiles(id) on delete cascade,   -- who sent the request
  b uuid not null references public.profiles(id) on delete cascade,   -- who received it
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b)
);

-- ---------------------------------------------------------------- security (RLS)
alter table public.profiles         enable row level security;
alter table public.match_results    enable row level security;
alter table public.kits             enable row level security;
alter table public.missions         enable row level security;
alter table public.mission_progress enable row level security;
alter table public.friends          enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "own matches" on public.match_results;
create policy "own matches" on public.match_results for select using (user_id = auth.uid());
drop policy if exists "kits are public" on public.kits;
create policy "kits are public" on public.kits for select using (true);
drop policy if exists "missions are public" on public.missions;
create policy "missions are public" on public.missions for select using (true);
drop policy if exists "own mission progress" on public.mission_progress;
create policy "own mission progress" on public.mission_progress for select using (user_id = auth.uid());
drop policy if exists "own friendships" on public.friends;
create policy "own friendships" on public.friends for select using (auth.uid() in (a, b));
-- Players can read (filtered by the policies above) but never write directly:
-- every change goes through the checked functions below.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.match_results, public.kits, public.missions, public.mission_progress, public.friends to anon, authenticated;
revoke insert, update, delete on public.profiles, public.match_results, public.kits, public.missions, public.mission_progress, public.friends from anon, authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public.level_for_xp(total int) returns int
language plpgsql immutable as $$
declare l int := 1; need int; left_xp int := greatest(total, 0);
begin
  loop
    need := 100 + (l - 1) * 40;
    exit when left_xp < need or l >= 200;
    left_xp := left_xp - need; l := l + 1;
  end loop;
  return l;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- daily key = UTC date, weekly key = Monday of the UTC week
create or replace function public.period_key(p text) returns text
language sql stable as $$
  select case when p = 'daily' then 'd:' || to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')
              else 'w:' || to_char(date_trunc('week', now() at time zone 'utc')::date, 'YYYY-MM-DD') end
$$;

-- 3 daily + 3 weekly missions, the same for everyone, rotating each day/week
create or replace function public.active_missions()
returns table (id text, period text, stat text, goal int, reward_xp int, reward_coins int, title text, period_key text)
language sql stable as $$
  (select m.id, m.period, m.stat, m.goal, m.reward_xp, m.reward_coins, m.title, public.period_key('daily')
     from public.missions m where m.period = 'daily' order by md5(m.id || public.period_key('daily')) limit 3)
  union all
  (select m.id, m.period, m.stat, m.goal, m.reward_xp, m.reward_coins, m.title, public.period_key('weekly')
     from public.missions m where m.period = 'weekly' order by md5(m.id || public.period_key('weekly')) limit 3)
$$;

-- ---------------------------------------------------------------- new accounts
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), 'Player' || substr(new.id::text, 1, 6));
begin
  insert into public.profiles (id, username) values (new.id, left(uname, 16))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.username_available(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(trim(name)))
$$;

-- ---------------------------------------------------------------- match results → XP, coins, missions
-- p: {mode, diff, won, kills, finals, beds, deaths, blocks, arrows, seconds}
create or replace function public.submit_match(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  secs int; k int; f int; b int; d int; bl int; ar int; won boolean; mode text; diff text;
  mult numeric; xp_gain int; coin_gain int; new_level int; old_level int;
  m record; amount int; missions_out jsonb := '[]'::jsonb;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'not signed in'; end if;
  if me.banned then raise exception 'banned'; end if;

  mode := coalesce(p->>'mode', 'solo'); if mode not in ('solo','mp','quick') then mode := 'solo'; end if;
  diff := p->>'diff'; if diff not in ('easy','normal','hard') then diff := null; end if;
  secs := least(greatest(coalesce((p->>'seconds')::int, 0), 0), 3600);
  -- you can't submit more playtime than real time has passed since your last match
  if me.last_submit is not null then
    secs := least(secs, greatest(0, extract(epoch from (now() - me.last_submit))::int));
  end if;
  if me.last_submit is not null and now() - me.last_submit < interval '30 seconds' then
    raise exception 'too soon';
  end if;
  -- sanity caps so faked numbers can't break the leaderboards
  k  := least(greatest(coalesce((p->>'kills')::int, 0), 0), 2 + secs / 6);
  f  := least(greatest(coalesce((p->>'finals')::int, 0), 0), k, 15);
  b  := least(greatest(coalesce((p->>'beds')::int, 0), 0), 3);
  d  := least(greatest(coalesce((p->>'deaths')::int, 0), 0), 500);
  bl := least(greatest(coalesce((p->>'blocks')::int, 0), 0), secs * 6);
  ar := least(greatest(coalesce((p->>'arrows')::int, 0), 0), secs / 2);
  won := coalesce((p->>'won')::boolean, false) and secs >= 60;

  -- XP comes from playing and fighting, not from winning. Harder bots = more XP.
  mult := case when mode in ('mp','quick') then 1.3
               when diff = 'hard' then 1.6 when diff = 'normal' then 1.0 else 0.5 end;
  if secs < 45 then xp_gain := 0;
  else xp_gain := least(600, round((least(secs, 1800) / 12 + k * 8 + f * 20 + b * 30 + bl / 20 + ar * 3) * mult));
  end if;
  coin_gain := round(xp_gain * 0.6) + case when won then 15 else 0 end;

  old_level := me.level;
  new_level := public.level_for_xp(me.xp + xp_gain);
  update public.profiles set
    xp = xp + xp_gain, level = new_level, coins = coins + coin_gain,
    games = games + case when secs >= 45 then 1 else 0 end, wins = wins + case when won then 1 else 0 end,
    kills = kills + k, finals = finals + f, beds = beds + b, deaths = deaths + d, blocks = blocks + bl,
    play_seconds = play_seconds + secs, last_submit = now()
  where id = me.id;

  insert into public.match_results (user_id, mode, diff, won, kills, finals, beds, deaths, blocks, arrows, seconds, xp, coins)
  values (me.id, mode, diff, won, k, f, b, d, bl, ar, secs, xp_gain, coin_gain);

  -- mission progress
  if secs >= 45 then
    for m in select * from public.active_missions() loop
      amount := case m.stat
        when 'kills' then k when 'finals' then f when 'beds' then b when 'blocks' then bl when 'arrows' then ar
        when 'games' then 1 when 'wins' then (case when won then 1 else 0 end)
        when 'minutes' then secs / 60
        when 'hard' then (case when mode = 'solo' and diff = 'hard' then 1 else 0 end)
        when 'mp' then (case when mode in ('mp','quick') then 1 else 0 end)
        else 0 end;
      if amount > 0 then
        insert into public.mission_progress (user_id, period_key, mission, progress)
        values (me.id, m.period_key, m.id, least(amount, m.goal))
        on conflict (user_id, period_key, mission)
          do update set progress = least(public.mission_progress.progress + amount, m.goal);
      end if;
    end loop;
  end if;

  return jsonb_build_object('xp_gain', xp_gain, 'coin_gain', coin_gain, 'level', new_level,
    'leveled_up', new_level > old_level, 'xp', me.xp + xp_gain, 'coins', me.coins + coin_gain, 'mult', mult);
end $$;

create or replace function public.get_missions()
returns table (id text, period text, title text, goal int, reward_xp int, reward_coins int, period_key text, progress int, claimed boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.period, a.title, a.goal, a.reward_xp, a.reward_coins, a.period_key,
         coalesce(mp.progress, 0), coalesce(mp.claimed, false)
  from public.active_missions() a
  left join public.mission_progress mp on mp.user_id = auth.uid() and mp.period_key = a.period_key and mp.mission = a.id
$$;

create or replace function public.claim_mission(mission_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record; mp public.mission_progress; me public.profiles;
begin
  select * into a from public.active_missions() x where x.id = mission_id;
  if a.id is null then raise exception 'mission not active'; end if;
  select * into mp from public.mission_progress where user_id = auth.uid() and period_key = a.period_key and mission = a.id for update;
  if mp.user_id is null or mp.progress < a.goal then raise exception 'not finished'; end if;
  if mp.claimed then raise exception 'already claimed'; end if;
  update public.mission_progress set claimed = true where user_id = auth.uid() and period_key = a.period_key and mission = a.id;
  update public.profiles set xp = xp + a.reward_xp, coins = coins + a.reward_coins, level = public.level_for_xp(xp + a.reward_xp)
    where id = auth.uid() returning * into me;
  return jsonb_build_object('xp', me.xp, 'coins', me.coins, 'level', me.level, 'reward_xp', a.reward_xp, 'reward_coins', a.reward_coins);
end $$;

-- ---------------------------------------------------------------- kits
create or replace function public.buy_kit(kit_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k public.kits; me public.profiles;
begin
  select * into k from public.kits where id = kit_id;
  if k.id is null then raise exception 'unknown kit'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'not signed in'; end if;
  if kit_id = any(me.kits) then raise exception 'already owned'; end if;
  if me.level < k.min_level then raise exception 'level too low'; end if;
  if me.coins < k.price then raise exception 'not enough coins'; end if;
  update public.profiles set coins = coins - k.price, kits = array_append(kits, kit_id), kit = kit_id
    where id = me.id returning * into me;
  return jsonb_build_object('coins', me.coins, 'kits', me.kits, 'kit', me.kit);
end $$;

create or replace function public.set_kit(kit_id text) returns text
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set kit = kit_id where id = auth.uid() and kit_id = any(kits);
  if not found then raise exception 'kit not owned'; end if;
  return kit_id;
end $$;

-- ---------------------------------------------------------------- leaderboards
-- stat: xp | kills | finals | beds | wins ; weekly = this week only (from match results)
create or replace function public.leaderboard(stat text default 'xp', weekly boolean default false, lim int default 10)
returns table (username text, level int, value bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if stat not in ('xp','kills','finals','beds','wins') then stat := 'xp'; end if;
  lim := least(greatest(lim, 1), 100);
  if weekly then
    return query execute format(
      'select p.username, p.level, sum(%s)::bigint as v from public.match_results r join public.profiles p on p.id = r.user_id
        where r.created_at >= date_trunc(''week'', now() at time zone ''utc'') and not p.banned
        group by p.username, p.level having sum(%s) > 0 order by v desc limit %s',
      case when stat = 'wins' then '(case when r.won then 1 else 0 end)' else 'r.' || stat end,
      case when stat = 'wins' then '(case when r.won then 1 else 0 end)' else 'r.' || stat end, lim);
  else
    return query execute format(
      'select username, level, %I::bigint from public.profiles where not banned and %I > 0 order by %I desc, created_at limit %s', stat, stat, stat, lim);
  end if;
end $$;

-- ---------------------------------------------------------------- friends
create or replace function public.send_friend_request(friend_name text) returns text
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  select id into other from public.profiles where lower(username) = lower(trim(friend_name));
  if other is null then raise exception 'player not found'; end if;
  if other = auth.uid() then raise exception 'that is you'; end if;
  if exists (select 1 from public.friends where (a = auth.uid() and b = other) or (a = other and b = auth.uid())) then
    -- if they already asked us, accept instead
    update public.friends set status = 'accepted' where a = other and b = auth.uid();
    return 'ok';
  end if;
  if (select count(*) from public.friends where a = auth.uid() or b = auth.uid()) >= 100 then raise exception 'friend list full'; end if;
  insert into public.friends (a, b) values (auth.uid(), other);
  return 'sent';
end $$;

create or replace function public.respond_friend(other uuid, accept boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if accept then update public.friends set status = 'accepted' where a = other and b = auth.uid();
  else delete from public.friends where a = other and b = auth.uid(); end if;
  return 'ok';
end $$;

create or replace function public.remove_friend(other uuid) returns text
language sql security definer set search_path = public as $$
  delete from public.friends where (a = auth.uid() and b = other) or (a = other and b = auth.uid());
  select 'ok'::text;
$$;

create or replace function public.my_friends()
returns table (id uuid, username text, level int, status text, incoming boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.level, f.status, (f.b = auth.uid() and f.status = 'pending')
  from public.friends f join public.profiles p on p.id = case when f.a = auth.uid() then f.b else f.a end
  where auth.uid() in (f.a, f.b)
  order by f.status, p.username
$$;

-- ---------------------------------------------------------------- admin tools
create or replace function public.admin_find(q text)
returns table (id uuid, username text, email text, level int, xp int, coins int, kits text[], banned boolean, is_admin boolean, games int, kills int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query select p.id, p.username, u.email::text, p.level, p.xp, p.coins, p.kits, p.banned, p.is_admin, p.games, p.kills, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    where p.username ilike '%' || coalesce(q, '') || '%'
    order by p.username limit 50;
end $$;

-- Give a player a new password (when they forget theirs)
create or replace function public.admin_set_password(target uuid, new_password text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if length(new_password) < 6 then raise exception 'password must be at least 6 characters'; end if;
  update auth.users set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = now() where id = target;
  if not found then raise exception 'user not found'; end if;
  return 'ok';
end $$;

-- Change coins/xp, ban, make admin, rename, give a kit
create or replace function public.admin_update(target uuid, changes jsonb) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare me public.profiles;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if changes ? 'username' and not public.username_available(changes->>'username') then raise exception 'that username is taken'; end if;
  if target = auth.uid() and (changes ? 'is_admin') and not (changes->>'is_admin')::boolean then raise exception 'you cannot remove your own admin'; end if;
  update public.profiles set
    coins    = greatest(0, coins + coalesce((changes->>'add_coins')::int, 0)),
    xp       = greatest(0, xp + coalesce((changes->>'add_xp')::int, 0)),
    banned   = coalesce((changes->>'banned')::boolean, banned),
    is_admin = coalesce((changes->>'is_admin')::boolean, is_admin),
    username = coalesce(nullif(left(trim(changes->>'username'), 16), ''), username),
    kits     = case when changes ? 'give_kit' and not ((changes->>'give_kit') = any(kits)) then array_append(kits, changes->>'give_kit') else kits end
  where id = target returning * into me;
  update public.profiles set level = public.level_for_xp(xp) where id = target returning * into me;
  -- the login name is the username, so a rename must change the hidden login email too
  if changes ? 'username' and nullif(trim(changes->>'username'), '') is not null then
    update auth.users set email = lower(me.username) || '@players.example.com', updated_at = now() where id = target;
  end if;
  return to_jsonb(me);
end $$;

-- functions are callable by signed-in players; anonymous visitors only need the public ones
revoke execute on function public.submit_match(jsonb), public.claim_mission(text), public.buy_kit(text), public.set_kit(text),
  public.send_friend_request(text), public.respond_friend(uuid, boolean), public.remove_friend(uuid),
  public.admin_find(text), public.admin_set_password(uuid, text), public.admin_update(uuid, jsonb) from anon, public;
grant execute on function public.submit_match(jsonb), public.claim_mission(text), public.buy_kit(text), public.set_kit(text),
  public.send_friend_request(text), public.respond_friend(uuid, boolean), public.remove_friend(uuid),
  public.admin_find(text), public.admin_set_password(uuid, text), public.admin_update(uuid, jsonb) to authenticated;

-- =====================================================================
--  AFTER you create your own account in the game, run this ONE line
--  (put your username in) to make yourself the admin:
--
--  update public.profiles set is_admin = true where lower(username) = lower('YourUsername');
-- =====================================================================
