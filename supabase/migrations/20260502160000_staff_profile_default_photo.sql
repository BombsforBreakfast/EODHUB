-- Default profile photo for EOD HUB staff accounts (same asset as nav branding).
-- Fixes broken/missing avatars for hello@eod-hub.com and other pure-admin rows.

UPDATE public.profiles AS p
SET photo_url = '/branding/eod-crab-logo.png'
FROM auth.users AS u
WHERE p.user_id = u.id
  AND lower(trim(u.email)) = lower('hello@eod-hub.com');

UPDATE public.profiles
SET photo_url = '/branding/eod-crab-logo.png'
WHERE is_pure_admin IS TRUE
  AND (photo_url IS NULL OR trim(photo_url) = '');
