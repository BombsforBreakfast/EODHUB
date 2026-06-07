export type HomePartner = {
  name: string;
  logoSrc: string;
  href?: string;
};

/** Partner logos shown on the login page for brand trust. Append new entries as partnerships grow. */
export const HOME_PARTNERS: HomePartner[] = [
  {
    name: "After The Long Walk",
    logoSrc: "/branding/partners/after-the-long-walk.png",
    href: "https://www.afterthelongwalk.com/",
  },
];
