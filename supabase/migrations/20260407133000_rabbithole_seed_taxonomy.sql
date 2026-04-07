-- Rabbithole MVP seed taxonomy (topics, subtopics, tags, synonym aliases)

insert into public.rabbithole_topics (slug, name, description, sort_order, is_active)
values
  ('cuas', 'CUAS', 'Counter-UAS tactics, systems, and field lessons.', 10, true),
  ('counter-ied', 'Counter IED', 'Procedures, safety, and post-incident analysis for IED threats.', 20, true),
  ('uas', 'UAS', 'Platform behavior, payload tradeoffs, and mission planning.', 30, true),
  ('retirement', 'Retirement', 'Transition planning, retirement systems, and timing decisions.', 40, true),
  ('benefits', 'Benefits', 'Benefits navigation, eligibility, and optimization.', 50, true),
  ('training', 'Training', 'Programs, drills, and readiness patterns for teams.', 60, true),
  ('exploitation', 'Exploitation', 'Device exploitation workflows, forensic handling, and reporting.', 70, true),
  ('equipment', 'Equipment', 'Platform and gear selection, maintenance, and field reliability.', 80, true),
  ('leadership', 'Leadership', 'Team leadership, standards, and professional development.', 90, true),
  ('career', 'Career', 'Assignments, growth paths, and long-term career decisions.', 100, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

insert into public.rabbithole_subtopics (topic_id, slug, name, sort_order, is_active)
select t.id, s.slug, s.name, s.sort_order, true
from public.rabbithole_topics t
join (
  values
    ('cuas', 'gpsnav', 'GPSNAV', 10),
    ('cuas', 'detection', 'Detection', 20),
    ('cuas', 'jamming', 'Jamming', 30),
    ('cuas', 'exploitation', 'Exploitation', 40),
    ('counter-ied', 'route-clearance', 'Route Clearance', 10),
    ('counter-ied', 'render-safe', 'Render Safe', 20),
    ('uas', 'payloads', 'Payloads', 10),
    ('uas', 'airframes', 'Airframes', 20),
    ('training', 'qualification', 'Qualification', 10),
    ('training', 'evaluation', 'Evaluation', 20),
    ('equipment', 'maintenance', 'Maintenance', 10),
    ('career', 'assignments', 'Assignments', 10)
) as s(topic_slug, slug, name, sort_order)
  on t.slug = s.topic_slug
on conflict (topic_id, slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active;

insert into public.rabbithole_tags (slug, name, is_active)
values
  ('uas', 'UAS', true),
  ('counter-uas', 'Counter-UAS', true),
  ('c-uas', 'C-UAS', true),
  ('unmanned-aerial-systems', 'Unmanned Aerial Systems', true),
  ('garmin', 'Garmin', true),
  ('telemetry', 'Telemetry', true),
  ('forensics', 'Forensics', true),
  ('ttp', 'TTP', true),
  ('flight-planning', 'Flight Planning', true)
on conflict (slug) do update
set name = excluded.name,
    is_active = excluded.is_active;

-- Normalize for search matching: lower case, strip punctuation (keep spaces), hyphens -> spaces,
-- collapse whitespace. DISTINCT ON avoids duplicate normalized_alias in one INSERT (Postgres:
-- "ON CONFLICT DO UPDATE command cannot affect row a second time").
with raw_aliases as (
  select v.alias_text, v.tag_slug
  from (values
    ('UAS', 'uas'),
    ('UAV', 'uas'),
    ('Drone Systems', 'uas'),
    ('Unmanned Aerial Systems', 'uas'),
    ('Counter UAS', 'counter-uas'),
    ('Counter-UAS', 'counter-uas'),
    ('Counter Unmanned Aerial Systems', 'counter-uas'),
    ('C-UAS', 'c-uas'),
    ('CUAS', 'c-uas'),
    ('GPS Spoofing', 'garmin'),
    ('GNSS', 'garmin')
  ) as v(alias_text, tag_slug)
),
normalized_aliases as (
  select
    r.alias_text,
    r.tag_slug,
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(r.alias_text), '[^a-z0-9[:space:]-]', ' ', 'g'),
          '-',
          ' ',
          'g'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ) as normalized_alias
  from raw_aliases r
),
alias_seed as (
  select distinct on (normalized_alias)
    alias_text,
    normalized_alias,
    tag_slug
  from normalized_aliases
  order by normalized_alias, tag_slug, alias_text
)
insert into public.rabbithole_tag_aliases (tag_id, alias_text, normalized_alias)
select t.id, a.alias_text, a.normalized_alias
from alias_seed a
join public.rabbithole_tags t on t.slug = a.tag_slug
on conflict (normalized_alias) do update
set tag_id = excluded.tag_id,
    alias_text = excluded.alias_text;
