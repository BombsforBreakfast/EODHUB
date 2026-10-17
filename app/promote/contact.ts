export const PROMOTE_EMAIL = "promote@eod-hub.com";

export function promotionEmailLink(packageName?: string): string {
  const subject = packageName
    ? `EOD-HUB ${packageName} promotion inquiry`
    : "EOD-HUB promotion access request";
  const body = [
    "Hi EOD-HUB,",
    "",
    packageName
      ? `I’m interested in the ${packageName} promotion package.`
      : "I’d like to learn about promoting to the EOD community and request access to the promotion page.",
    "",
    "Name:",
    "Business or organization (if applicable):",
    "What I’d like to promote:",
    "Website or listing link:",
    "Preferred timing:",
    "",
    "Thank you!",
  ].join("\n");
  return `mailto:${PROMOTE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
