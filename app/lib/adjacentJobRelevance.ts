export type AdjacentJobMatch = { family: "emergency management" | "property disposal"; relevant: boolean; reason: string };

/** These job families need evidence in the role itself, rather than an employer name or bare "disposal". */
export function matchAdjacentJob(title: string, description: string): AdjacentJobMatch | null {
  const family = /\bproperty[\s-]+disposal\b/i.test(title)
    ? "property disposal"
    : /\bemergency[\s-]+(?:management|preparedness)\b|\bem[\s-]+specialists?\b/i.test(title)
      ? "emergency management" : null;
  if (!family) return null;
  const ordnance = String.raw`\b(?:explosive(?:s)?(?:[\s-]+(?:ordnance|safety|hazards?|handling))?|ordnance|eod[\s-]+(?:response|operations?|planning|training|technicians?|specialists?|teams?)|munitions|ammunition|uxo|unexploded|demining|demilitarization|demilitarisation|c[\s-]?ied|iedd|render[\s-]+safe|bomb[\s-]+(?:squad|technician)|hazardous[\s-]+devices)\b`;
  const em = String.raw`\b(?:cbrne?|hazmat|hazardous[\s-]+materials|weapons[\s-]+of[\s-]+mass[\s-]+destruction|cwmd|wmd)\b`;
  const signal = family === "property disposal" ? ordnance : `(?:${ordnance}|${em})`;
  const duty = String.raw`\b(?:develop\w*|execut\w*|coordinat\w*|conduct\w*|manag\w*|handl\w*|dispos\w*|demilitariz\w*|demilitaris\w*|respond\w*|train\w*|instruct\w*|contain\w*|detect\w*|identif\w*|control\w*|remediat\w*|responsible[\s]+for|experience[\s]+(?:in|with)|knowledge[\s]+of|certif\w*)\b`;
  const plain = description.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
  const directTitle = new RegExp(signal, "i").test(title);
  // Require a duty/qualification near a specific signal in the same sentence.
  // An incidental reference to another team or company does not qualify.
  const duties = new RegExp(`(?:${duty}[^.!?\\n]{0,220}${signal}|${signal}[^.!?\\n]{0,220}${duty})`, "i").test(plain);
  const relevant = directTitle || duties;
  return { family, relevant, reason: relevant
    ? `+ ${family} with relevant technical duties`
    : `Excluded: generic ${family} without relevant technical duties` };
}

