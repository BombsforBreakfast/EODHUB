-- Allow empty summaries on RabbitHole structured contributions (UI treats summary as optional).
alter table public.rabbithole_contributions
  drop constraint if exists rabbithole_contributions_summary_len;
