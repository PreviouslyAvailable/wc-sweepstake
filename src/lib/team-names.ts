// Shared mapping of SportAPI (Sofascore) team name variants to our 3-letter IDs.
// Used by the sync route, live route, and results import.

// Pool teams are in the draw; opponent teams exist only for fixture FK + scoring.
export const OPPONENT_TEAMS: Record<
  string,
  { name: string; flag: string; world_rank: number; aliases: string[] }
> = {
  QAT: { name: "Qatar", flag: "🇶🇦", world_rank: 55, aliases: ["Qatar"] },
  HAI: { name: "Haiti", flag: "🇭🇹", world_rank: 88, aliases: ["Haiti"] },
  CUW: { name: "Curaçao", flag: "🇨🇼", world_rank: 92, aliases: ["Curaçao", "Curacao"] },
  CPV: { name: "Cabo Verde", flag: "🇨🇻", world_rank: 75, aliases: ["Cabo Verde", "Cape Verde"] },
  KSA: { name: "Saudi Arabia", flag: "🇸🇦", world_rank: 60, aliases: ["Saudi Arabia"] },
  IRQ: { name: "Iraq", flag: "🇮🇶", world_rank: 58, aliases: ["Iraq"] },
  JOR: { name: "Jordan", flag: "🇯🇴", world_rank: 70, aliases: ["Jordan"] },
  GHA: { name: "Ghana", flag: "🇬🇭", world_rank: 65, aliases: ["Ghana"] },
  RSA: { name: "South Africa", flag: "🇿🇦", world_rank: 57, aliases: ["South Africa"] },
  BIH: { name: "Bosnia and Herzegovina", flag: "🇧🇦", world_rank: 72, aliases: ["Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnia & Herzegovina"] },
};

const POOL_NAMES: Record<string, string> = {
  "Argentina": "ARG",
  "Spain": "ESP",
  "France": "FRA",
  "England": "ENG",
  "Portugal": "POR",
  "Brazil": "BRA",
  "Morocco": "MAR",
  "Netherlands": "NED",
  "Belgium": "BEL",
  "Germany": "GER",
  "Croatia": "CRO",
  "Colombia": "COL",
  "Mexico": "MEX",
  "Senegal": "SEN",
  "Uruguay": "URU",
  "United States": "USA", "USA": "USA",
  "Japan": "JPN",
  "Switzerland": "SUI",
  "Iran": "IRN", "IR Iran": "IRN",
  "Turkiye": "TUR", "Turkey": "TUR", "Türkiye": "TUR",
  "Ecuador": "ECU",
  "Austria": "AUT",
  "South Korea": "KOR", "Korea Republic": "KOR",
  "Australia": "AUS",
  "Algeria": "ALG",
  "Egypt": "EGY",
  "Canada": "CAN",
  "Norway": "NOR",
  "Ivory Coast": "CIV", "Cote d'Ivoire": "CIV", "Côte d'Ivoire": "CIV", "Côte D'Ivoire": "CIV",
  "Panama": "PAN",
  "Sweden": "SWE",
  "Czechia": "CZE", "Czech Republic": "CZE",
  "Paraguay": "PAR",
  "Scotland": "SCO",
  "Tunisia": "TUN",
  "DR Congo": "COD", "Congo DR": "COD", "Democratic Republic of Congo": "COD",
  "Uzbekistan": "UZB",
  "New Zealand": "NZL",
};

function buildNameToId(): Record<string, string> {
  const map = { ...POOL_NAMES };
  for (const [id, team] of Object.entries(OPPONENT_TEAMS)) {
    for (const alias of team.aliases) {
      map[alias] = id;
    }
  }
  return map;
}

export const NAME_TO_ID: Record<string, string> = buildNameToId();
