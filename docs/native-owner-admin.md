# Owner Admin access in the native apps

The EOD Hub dropdown offers Admin inside iOS/Android only when the signed-in user has all three: user ID `a28ddac8-dc3a-4ae1-83f5-b675e7b85871`, email `micheal.p.twigg@gmail.com`, and an active admin profile. The same policy is checked before the Admin page loads its queues. The native page gate also binds its exception to the current auth account and the verified admin actor, so switching accounts removes the exception. Other native accounts do not receive this new access. Existing web-admin permissions and server/RLS authorization are preserved.

`ownerAdminAccess.ts` is a UI/platform policy, not a substitute for API authorization. No client parameter, query string, role toggle or shared password enables it. Employer pages retain their native desktop-only gate. Promotions review retains its separate owner-only API checks.

At phone widths, the full Admin panel uses an Admin section selector with the same sections and pending badges as the desktop tabs. Pending only remains available. Existing responsive cards and scrollable tables are retained.

User, signup-outreach, waitlist and failed-auth CSV exports use the existing Capacitor Filesystem/Share plugins in native apps. The owner chooses a save/share destination. Files are UTF-8 with a BOM and are staged in app cache; they are not automatically emailed or uploaded. Cache files are retained after the share sheet closes because another app may still be reading them. Web browsers continue to download CSVs normally. Third-party dashboards and external sources retain their external links.

The installed shells load `https://eod-hub.com` through the existing Capacitor server configuration. This feature is a web deployment and uses already-installed plugins; it requires no app-store binary update. Reopen the app to load the new menu.

Validation: `npm run test:owner-admin` covers owner identity, missing/non-admin accounts, other admins, copied owner email, account switching and existing web-admin visibility. Run TypeScript, targeted ESLint and the existing native sync check. Verify the signed-in mobile layout and read-only section navigation in a browser; physical device confirmation is still needed for the actual native share sheet.
