/** Positive review hints only. A score never approves or rejects a listing. */
export function positiveJobSignals(title: string, description = "") {
  const clean = (text: string) => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|#160);/gi, " ")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const t = clean(title), d = clean(description);
  let score = 0;
  const reasons: string[] = [], matchedKeywords: string[] = [];
  const add = (pattern: RegExp, label: string, titlePoints: number, bodyPoints: number) => {
    for (const [text, points, field] of [[t, titlePoints, "title"], [d, bodyPoints, "description"]] as const) {
      if (points && pattern.test(text)) {
        score = Math.max(score, points);
        reasons.push(`${points}: ${label} in ${field}`);
        if (!matchedKeywords.includes(label)) matchedKeywords.push(label);
      }
    }
  };
  add(/\bexplosive ordnance disposal\b/, "Explosive Ordnance Disposal", 100, 100);
  add(/\bexplosive ordnance\b/, "Explosive Ordnance", 100, 100);
  add(/\b(?:uxo|unexploded ordnance)\b/, "UXO", 100, 85);
  add(/\bbomb (?:techs?|technicians?)\b/, "Bomb Technician", 100, 85);
  add(/\b(?:cwmd|c wmd)\b/, "CWMD", 100, 75);
  add(/\bcounter(?:ing)? weapons of mass destruction\b/, "Countering Weapons of Mass Destruction", 100, 100);
  add(/\bexplosives?\b/, "Explosive / explosives", 75, 60);
  // Preserve positive adjacent mission evidence without any role/degree penalties.
  add(/\beod\b/, "EOD", 90, 70);
  add(/\b(?:cbrne?|wmd|iedd|c ied|counter ied|improvised explosive devices?|mine action|demining|ordnance|munitions|ammunition|c uas|counter uas|uas|uav|drones?)\b/, "Related mission", 70, 45);
  return { score, reasons, matchedKeywords };
}
