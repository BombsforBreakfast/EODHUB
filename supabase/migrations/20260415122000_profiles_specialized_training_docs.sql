alter table public.profiles
  add column if not exists specialized_training_docs jsonb;

