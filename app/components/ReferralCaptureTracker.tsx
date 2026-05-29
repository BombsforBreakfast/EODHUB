"use client";

import { useEffect } from "react";
import { captureReferralFromUrl } from "../lib/referralCapture";

/** Captures ?ref= site-wide on first page load (mounted once in root layout). */
export default function ReferralCaptureTracker() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);
  return null;
}
