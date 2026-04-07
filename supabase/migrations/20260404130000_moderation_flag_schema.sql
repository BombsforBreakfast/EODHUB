-- Moderation: hide content pending review, flag categories, community flag tally

ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden_for_review boolean NOT NULL DEFAULT false;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS hidden_for_review boolean NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS hidden_for_review boolean NOT NULL DEFAULT false;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_flag_count integer NOT NULL DEFAULT 0;

ALTER TABLE flags ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE flags DROP CONSTRAINT IF EXISTS flags_category_check;
ALTER TABLE flags ADD CONSTRAINT flags_category_check CHECK (
  category IS NULL OR category IN (
    'self_harm',
    'nudity',
    'spam_bot',
    'hatespeech',
    'harassment',
    'unlawful_activity',
    'spillage',
    'general'
  )
);
