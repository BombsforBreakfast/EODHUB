"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminPostDisplayName,
  canUsePostAsSelector,
  loadStoredPostAsMode,
  POST_AS_ADMIN_EMAIL,
  type PostAsAdminProfile,
  type PostAsMode,
  resolvePostAsUserIdForSubmit,
  storePostAsMode,
} from "../lib/postAsIdentity";

type Options = {
  userEmail: string | null;
  selfLabel: string;
  selfPhotoUrl: string | null;
  enabled?: boolean;
};

export function usePostAsIdentity(supabase: SupabaseClient, options: Options) {
  const { userEmail, selfLabel, selfPhotoUrl, enabled = true } = options;
  const [postAsMode, setPostAsModeState] = useState<PostAsMode>(() => loadStoredPostAsMode());
  const [postAsAdminProfile, setPostAsAdminProfile] = useState<PostAsAdminProfile | null>(null);

  useEffect(() => {
    if (!enabled || !canUsePostAsSelector(userEmail)) return;

    let cancelled = false;
    void (async () => {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, photo_url")
        .eq("email", POST_AS_ADMIN_EMAIL)
        .maybeSingle();

      if (cancelled || !adminProfile) return;

      setPostAsAdminProfile({
        userId: adminProfile.user_id,
        displayName: adminPostDisplayName(adminProfile),
        photoUrl: adminProfile.photo_url ?? null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, supabase, userEmail]);

  const setPostAsMode = useCallback((mode: PostAsMode) => {
    setPostAsModeState(mode);
    storePostAsMode(mode);
  }, []);

  const showPostAsSelector = enabled && canUsePostAsSelector(userEmail) && postAsAdminProfile !== null;
  const postAsUserIdForSubmit = resolvePostAsUserIdForSubmit(postAsMode, postAsAdminProfile?.userId ?? null);

  return useMemo(
    () => ({
      postAsMode,
      setPostAsMode,
      postAsAdminProfile,
      showPostAsSelector,
      postAsUserIdForSubmit,
      selfLabel,
      selfPhotoUrl,
    }),
    [postAsAdminProfile, postAsMode, postAsUserIdForSubmit, selfLabel, selfPhotoUrl, setPostAsMode, showPostAsSelector],
  );
}
