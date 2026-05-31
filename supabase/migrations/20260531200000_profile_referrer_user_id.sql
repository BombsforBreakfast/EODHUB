-- Link recruits to the verified member who referred them (resolved from referral code at signup).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referrer_user_id uuid REFERENCES public.profiles (user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_referrer_user_id_idx
  ON public.profiles (referrer_user_id)
  WHERE referrer_user_id IS NOT NULL;

-- Backfill from existing referred_by referral codes.
UPDATE public.profiles recruit
SET referrer_user_id = referrer.user_id
FROM public.profiles referrer
WHERE recruit.referred_by IS NOT NULL
  AND btrim(recruit.referred_by) <> ''
  AND lower(btrim(recruit.referred_by)) = lower(btrim(referrer.referral_code))
  AND recruit.referrer_user_id IS NULL
  AND recruit.user_id <> referrer.user_id
  AND (
    referrer.is_approved = true
    OR referrer.verification_status = 'verified'
  );
