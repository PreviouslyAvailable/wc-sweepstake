/** Bullet-list tooltips for `.has-tip[data-tip]` — rendered with `white-space: pre-line` in CSS. */
const BULLET = "– ";

/** Hairline between context (team / fixture) and points breakdown. */
export const TIP_RULE = "────────────────────";

export interface TipSection {
  heading?: string | null;
  /** Plain lines above the rule — status, fixture, team list. */
  pre?: (string | null | undefined)[];
  lines?: (string | null | undefined)[];
}

export function formatTipLines(...lines: (string | null | undefined)[]): string {
  return lines
    .filter((line): line is string => Boolean(line))
    .map((line) => `${BULLET}${line}`)
    .join("\n");
}

function formatTipPre(...lines: (string | null | undefined)[]): string {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

/** One tooltip block: optional heading + context, rule, then bulleted lines. */
export function formatTipBlock(section: TipSection): string {
  const chunks: string[] = [];
  const info: string[] = [];

  if (section.heading) info.push(section.heading);
  const pre = formatTipPre(...(section.pre ?? []));
  if (pre) info.push(pre);

  const body = section.lines?.length ? formatTipLines(...section.lines) : "";

  if (info.length) chunks.push(info.join("\n"));
  if (info.length && body) chunks.push(TIP_RULE);
  if (body) chunks.push(body);

  return chunks.join("\n");
}

export function formatTipSections(sections: TipSection[]): string {
  return sections
    .map(formatTipBlock)
    .filter(Boolean)
    .join(`\n\n${TIP_RULE}\n\n`);
}
