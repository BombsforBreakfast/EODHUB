-- Align generated verdict body subtitle with app copy (Honorable vs Presiding).
begin;

create or replace function public.close_expired_kangaroo_courts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court record;
  v_winner_id uuid;
  v_winner_label text;
  v_winner_cnt int;
  v_pct int;
  v_total int;
  v_body text;
  n_closed int := 0;
begin
  for v_court in
    select k.id, k.feed_post_id, k.total_votes
    from public.kangaroo_courts k
    where k.status = 'active'
      and k.feed_post_id is not null
      and k.expires_at <= now()
    for update of k
  loop
    v_total := coalesce(v_court.total_votes, 0);

    select o.id, o.label, coalesce(c.cnt, 0)::int
    into v_winner_id, v_winner_label, v_winner_cnt
    from public.kangaroo_court_options o
    left join (
      select option_id, count(*)::int as cnt
      from public.kangaroo_court_votes
      where court_id = v_court.id
      group by option_id
    ) c on c.option_id = o.id
    where o.court_id = v_court.id
    order by coalesce(c.cnt, 0) desc, o.sort_order asc
    limit 1;

    if v_total > 0 and v_winner_cnt is not null then
      v_pct := round(100.0 * v_winner_cnt::numeric / v_total::numeric);
    else
      v_pct := 0;
    end if;

    v_body := format(
      E'Judge N. E. W.\nNewton E. Wentworth, Honorable\n\nThe court has reviewed the evidence.\nVerdict: %s\n%s%% of %s votes. Case closed.',
      v_winner_label,
      v_pct,
      v_total
    );

    insert into public.kangaroo_court_verdicts (court_id, winning_option_id, winning_label_snapshot, total_votes, body)
    values (v_court.id, v_winner_id, v_winner_label, v_total, v_body);

    update public.kangaroo_courts
    set status = 'closed',
        closed_at = now(),
        winning_option_id = v_winner_id
    where id = v_court.id;

    update public.posts
    set court_verdict_at = now()
    where id = v_court.feed_post_id;

    n_closed := n_closed + 1;
  end loop;

  return n_closed;
end;
$$;

revoke all on function public.close_expired_kangaroo_courts() from public;
grant execute on function public.close_expired_kangaroo_courts() to authenticated, service_role;

commit;
