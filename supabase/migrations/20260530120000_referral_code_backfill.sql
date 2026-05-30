-- Ensure every verified member has a unique referral code; prevent future gaps.

CREATE OR REPLACE FUNCTION public.generate_unique_referral_code(p_length int DEFAULT 8)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt int := 0;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..p_length LOOP
      candidate := candidate || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE lower(btrim(p.referral_code)) = lower(candidate)
    );

    attempt := attempt + 1;
    IF attempt >= 50 THEN
      RAISE EXCEPTION 'Could not generate unique referral code after % attempts', attempt;
    END IF;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_profile_referral_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.verification_status = 'verified'
     AND NEW.email_verified = true
     AND NEW.admin_verified = true
     AND (NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '')
     AND COALESCE(NEW.email, '') NOT ILIKE '%@system.%'
     AND COALESCE(NEW.email, '') NOT ILIKE '%.invalid'
  THEN
    NEW.referral_code := public.generate_unique_referral_code();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_ensure_referral_code_before_write ON public.profiles;

CREATE TRIGGER profiles_ensure_referral_code_before_write
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_profile_referral_code();

UPDATE public.profiles p
SET referral_code = public.generate_unique_referral_code()
WHERE (p.referral_code IS NULL OR btrim(p.referral_code) = '')
  AND p.verification_status = 'verified'
  AND p.email_verified = true
  AND p.admin_verified = true
  AND COALESCE(p.email, '') NOT ILIKE '%@system.%'
  AND COALESCE(p.email, '') NOT ILIKE '%.invalid';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique_idx
  ON public.profiles (lower(btrim(referral_code)))
  WHERE referral_code IS NOT NULL AND btrim(referral_code) <> '';
