import { getAppOrigin } from "./verificationEmail";

export const MONTHLY_COMMUNITY_UPDATE_SUBJECT =
  "A Note from the EOD-HUB Team";

export function buildMonthlyCommunityUpdateEmailHtml(origin?: string): string {
  const loginUrl = `${getAppOrigin(origin)}/login`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #222;">
      <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; color: #000;">EOD HUB</div>
      <p style="font-size: 12px; color: #888; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 28px;">
        Built for EOD Techs, by an EOD Tech.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">Hello Everyone,</p>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        As we close out another month, I wanted to take a moment to thank each of you for helping build what EOD-HUB is becoming.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        When this project started, the goal was simple: create a place built by the EOD community, for the EOD community. Thanks to your support, that vision continues to become a reality.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 12px;">Today, EOD-HUB has grown to:</p>
      <ul style="font-size: 16px; line-height: 1.7; margin: 0 0 20px; padding-left: 22px;">
        <li style="margin-bottom: 8px;"><strong>825 Verified Members</strong></li>
        <li style="margin-bottom: 8px;"><strong>4 Active Employer Accounts</strong></li>
        <li style="margin-bottom: 8px;"><strong>200+ Active Job Listings</strong></li>
        <li style="margin-bottom: 8px;"><strong>63 EOD Business &amp; Product Pages</strong></li>
        <li style="margin-bottom: 8px;"><strong>47 Resource Pages</strong></li>
        <li style="margin-bottom: 8px;"><strong>7 Private Groups</strong></li>
      </ul>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        Every new member, business, employer, and resource makes the platform more valuable for everyone.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 24px 0 12px;"><strong>Mobile Apps</strong></p>
      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        One of our biggest milestones this month has been submitting EOD-HUB to both the <strong>Apple App Store</strong> and <strong>Google Play Store</strong>. We're currently working through the review process and hope to have both apps available soon. Once approved, staying connected with the community will be easier than ever.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 24px 0 12px;"><strong>Jobs &amp; Employers</strong></p>
      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        Employment remains one of our highest priorities.
      </p>
      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        We're continuing to improve both the job search experience and the employer dashboard while actively recruiting additional employers to join the platform. Our goal is simple: make EOD-HUB the first place EOD technicians look for career opportunities and the first place employers go to find qualified talent.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 24px 0 12px;"><strong>Building the Community</strong></p>
      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        Beyond jobs, we're continuing to expand businesses, resources, and groups while making improvements across the platform based on your feedback. Many of the features and updates you've seen over the past few months have come directly from suggestions made by members of this community.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        Thank you to everyone who has taken the time to post, comment, report bugs, recommend improvements, invite teammates, or simply log in and explore. Every one of those actions helps move EOD-HUB forward.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        If you know another technician, unit member, retiree, public safety bomb technician, employer, or EOD-owned business that isn't on EOD-HUB yet, send them our way. The stronger this network becomes, the more valuable it is for all of us.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
        As always, thank you for being part of the community. We're excited for what's coming next.
      </p>

      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 8px;">Stay safe,</p>
      <p style="font-size: 16px; line-height: 1.7; margin: 0 0 28px;"><strong>The EOD-HUB Team</strong></p>

      <a href="${loginUrl}"
         style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin: 0 0 24px;">
        Log in to EOD-HUB
      </a>

      <p style="font-size: 13px; color: #999; margin-top: 32px; margin-bottom: 0;">
        Built for EOD Techs, by an EOD Tech.
      </p>
    </div>
  `;
}
