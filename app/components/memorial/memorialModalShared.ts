export type Memorial = {
  id: string;
  user_id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  death_date: string;
  created_at: string;
  source_url: string | null;
  category?: "military" | "leo_fed" | null;
};

export const MEMORIAL_COLUMNS =
  "id, user_id, name, bio, photo_url, death_date, created_at, source_url, category";

export const MEMORIAL_MILITARY_COLOR = "#d9582b";
export const MEMORIAL_LEO_COLOR = "#062b4f";

export function memorialTheme(category?: Memorial["category"]) {
  const isLeoFed = category === "leo_fed";
  return {
    color: isLeoFed ? MEMORIAL_LEO_COLOR : MEMORIAL_MILITARY_COLOR,
    label: isLeoFed ? "End of Watch" : "We Remember",
  };
}

export function memorialDisclaimer(category?: Memorial["category"]) {
  return category === "leo_fed"
    ? "* This information has been respectfully referenced from bombtechmemorial.org."
    : "* This memorial is respectfully referenced from the EOD Warrior Foundation Digital Wall. If anything appears inaccurate, please contact our admin or connect directly with EODWF through their website.";
}
