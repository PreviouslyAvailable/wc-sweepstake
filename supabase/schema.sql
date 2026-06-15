-- WC26 Office Sweepstake — run this once in the Supabase SQL editor for a fresh install.
-- For an existing installation, run the MIGRATION section at the bottom instead.

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id text primary key,                 -- e.g. 'NZL'
  name text not null,
  flag text not null,                  -- emoji
  band text not null default 'A',      -- 'A' | 'B' (draw pool) or 'O' (opponent, results only)
  world_rank int not null default 0,   -- FIFA world ranking (fixed for the tournament)
  is_out boolean not null default false,
  -- kept for compat; no longer used for scoring
  group_letter text not null default '',
  furthest_round text not null default 'group'
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  team_id text not null unique references teams(id),
  position int not null default 0,     -- 0 = Band A team, 1 = Band B team
  created_at timestamptz not null default now()
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  stage text not null default 'group', -- group | r32 | r16 | qf | sf | third | final
  team_a text not null references teams(id),
  team_b text not null references teams(id),
  score_a int not null,
  score_b int not null,
  yellow_a int not null default 0,
  red_a int not null default 0,
  yellow_b int not null default 0,
  red_b int not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

insert into settings (key, value)
  values ('draw_locked', 'false'::jsonb), ('pot', '{"buy_in": 10, "currency": "NZD"}'::jsonb)
  on conflict (key) do nothing;

-- Row-level security: everyone reads, all writes go through service-role API routes.
alter table participants enable row level security;
alter table teams enable row level security;
alter table assignments enable row level security;
alter table results enable row level security;
alter table settings enable row level security;

create policy "public read participants" on participants for select using (true);
create policy "public read teams" on teams for select using (true);
create policy "public read assignments" on assignments for select using (true);
create policy "public read results" on results for select using (true);
create policy "public read settings" on settings for select using (true);

-- The 38 pool teams: 19 Band A contenders, 19 Band B wildcards.
-- World ranks are fixed for the tournament (as seeded).
insert into teams (id, name, flag, band, world_rank) values
  -- Band A — contenders
  ('ARG','Argentina',    '🇦🇷','A', 1),
  ('ESP','Spain',        '🇪🇸','A', 2),
  ('FRA','France',       '🇫🇷','A', 3),
  ('ENG','England',      '🏴󠁧󠁢󠁥󠁮󠁧󠁿','A', 4),
  ('POR','Portugal',     '🇵🇹','A', 5),
  ('BRA','Brazil',       '🇧🇷','A', 6),
  ('MAR','Morocco',      '🇲🇦','A', 7),
  ('NED','Netherlands',  '🇳🇱','A', 8),
  ('BEL','Belgium',      '🇧🇪','A', 9),
  ('GER','Germany',      '🇩🇪','A',10),
  ('CRO','Croatia',      '🇭🇷','A',11),
  ('COL','Colombia',     '🇨🇴','A',13),
  ('MEX','Mexico',       '🇲🇽','A',14),
  ('SEN','Senegal',      '🇸🇳','A',15),
  ('URU','Uruguay',      '🇺🇾','A',16),
  ('USA','United States','🇺🇸','A',17),
  ('JPN','Japan',        '🇯🇵','A',18),
  ('SUI','Switzerland',  '🇨🇭','A',19),
  ('IRN','Iran',         '🇮🇷','A',20),
  -- Band B — mid-tier & the wildcard
  ('TUR','Türkiye',      '🇹🇷','B',22),
  ('ECU','Ecuador',      '🇪🇨','B',23),
  ('AUT','Austria',      '🇦🇹','B',24),
  ('KOR','South Korea',  '🇰🇷','B',25),
  ('AUS','Australia',    '🇦🇺','B',27),
  ('ALG','Algeria',      '🇩🇿','B',28),
  ('EGY','Egypt',        '🇪🇬','B',29),
  ('CAN','Canada',       '🇨🇦','B',30),
  ('NOR','Norway',       '🇳🇴','B',31),
  ('CIV','Ivory Coast',  '🇨🇮','B',33),
  ('PAN','Panama',       '🇵🇦','B',34),
  ('SWE','Sweden',       '🇸🇪','B',38),
  ('CZE','Czechia',      '🇨🇿','B',40),
  ('PAR','Paraguay',     '🇵🇾','B',41),
  ('SCO','Scotland',     '🏴󠁧󠁢󠁳󠁣󠁴󠁿','B',42),
  ('TUN','Tunisia',      '🇹🇳','B',45),
  ('COD','DR Congo',     '🇨🇩','B',46),
  ('UZB','Uzbekistan',   '🇺🇿','B',50),
  ('NZL','New Zealand',  '🇳🇿','B',85)
on conflict (id) do nothing;


-- ============================================================
-- MIGRATION — run this block if you already have an existing
-- installation and need to update it to the new scoring rules.
-- ============================================================
--
-- alter table teams add column if not exists band text not null default 'A';
-- alter table teams add column if not exists world_rank int not null default 0;
-- alter table results add column if not exists yellow_a int not null default 0;
-- alter table results add column if not exists red_a int not null default 0;
-- alter table results add column if not exists yellow_b int not null default 0;
-- alter table results add column if not exists red_b int not null default 0;
--
-- -- Remove teams not in the 38-team pool (delete assignments first)
-- delete from assignments where team_id in
--   ('RSA','BIH','QAT','HAI','JOR','CPV','IRQ','KSA','GHA','CUW');
-- delete from teams where id in
--   ('RSA','BIH','QAT','HAI','JOR','CPV','IRQ','KSA','GHA','CUW');
--
-- -- Set band and world_rank for all 38 pool teams
-- update teams set band='A', world_rank=1  where id='ARG';
-- update teams set band='A', world_rank=2  where id='ESP';
-- update teams set band='A', world_rank=3  where id='FRA';
-- update teams set band='A', world_rank=4  where id='ENG';
-- update teams set band='A', world_rank=5  where id='POR';
-- update teams set band='A', world_rank=6  where id='BRA';
-- update teams set band='A', world_rank=7  where id='MAR';
-- update teams set band='A', world_rank=8  where id='NED';
-- update teams set band='A', world_rank=9  where id='BEL';
-- update teams set band='A', world_rank=10 where id='GER';
-- update teams set band='A', world_rank=11 where id='CRO';
-- update teams set band='A', world_rank=13 where id='COL';
-- update teams set band='A', world_rank=14 where id='MEX';
-- update teams set band='A', world_rank=15 where id='SEN';
-- update teams set band='A', world_rank=16 where id='URU';
-- update teams set band='A', world_rank=17 where id='USA';
-- update teams set band='A', world_rank=18 where id='JPN';
-- update teams set band='A', world_rank=19 where id='SUI';
-- update teams set band='A', world_rank=20 where id='IRN';
-- update teams set band='B', world_rank=22 where id='TUR';
-- update teams set band='B', world_rank=23 where id='ECU';
-- update teams set band='B', world_rank=24 where id='AUT';
-- update teams set band='B', world_rank=25 where id='KOR';
-- update teams set band='B', world_rank=27 where id='AUS';
-- update teams set band='B', world_rank=28 where id='ALG';
-- update teams set band='B', world_rank=29 where id='EGY';
-- update teams set band='B', world_rank=30 where id='CAN';
-- update teams set band='B', world_rank=31 where id='NOR';
-- update teams set band='B', world_rank=33 where id='CIV';
-- update teams set band='B', world_rank=34 where id='PAN';
-- update teams set band='B', world_rank=38 where id='SWE';
-- update teams set band='B', world_rank=40 where id='CZE';
-- update teams set band='B', world_rank=41 where id='PAR';
-- update teams set band='B', world_rank=42 where id='SCO';
-- update teams set band='B', world_rank=45 where id='TUN';
-- update teams set band='B', world_rank=46 where id='COD';
-- update teams set band='B', world_rank=50 where id='UZB';
-- update teams set band='B', world_rank=85 where id='NZL';
