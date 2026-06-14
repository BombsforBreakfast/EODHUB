import {
  isNativeAuthCallbackPath,
  resolveNativeAppUrlOpenTarget,
  toAbsoluteNativeAppUrl,
  toNativeAuthCallbackPath,
} from "./nativeOAuthRedirect";

export type NativeOAuthReturnHandlers = {
  closeBrowser: () => Promise<void>;
  /** Full document navigation — required for server-side PKCE + auth cookies. */
  navigate: (absoluteUrl: string) => void;
  /** Client-side route for non-auth deep links (notifications, etc.). */
  clientRoute: (path: string) => void;
};

/**
 * Complete an OAuth return from appUrlOpen or getLaunchUrl.
 * Auth callbacks must use full navigation so /auth/callback/route.ts runs.
 */
export async function handleNativeOAuthReturn(
  rawUrl: string,
  handlers: NativeOAuthReturnHandlers,
): Promise<void> {
  console.info("[nativeOAuth] appUrlOpen", rawUrl);

  const target = resolveNativeAppUrlOpenTarget(rawUrl);
  if (!target) {
    console.warn("[nativeOAuth] unrecognized callback URL", rawUrl);
    return;
  }

  await handlers.closeBrowser();

  if (isNativeAuthCallbackPath(target)) {
    const callbackPath = toNativeAuthCallbackPath(target);
    const absolute = toAbsoluteNativeAppUrl(callbackPath);
    console.info("[nativeOAuth] PKCE exchange via full navigation", absolute);
    handlers.navigate(absolute);
    return;
  }

  console.info("[nativeOAuth] client route", target);
  handlers.clientRoute(target);
}
