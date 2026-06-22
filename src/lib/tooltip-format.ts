/** Bullet-list tooltips for `.has-tip[data-tip]` — rendered with `white-space: pre-line` in CSS. */
const BULLET = "– ";

export function formatTipLines(...lines: (string | null | undefined)[]): string {
  return lines
    .filter((line): line is string => Boolean(line))
    .map((line) => `${BULLET}${line}`)
    .join("\n");
}

export function formatTipSections(
  sections: Array<{
    heading?: string | null;
    lines: (string | null | undefined)[];
  }>
): string {
  return sections
    .map(({ heading, lines }) => {
      const body = formatTipLines(...lines);
      if (heading && body) return `${heading}\n${body}`;
      if (heading) return heading;
      return body;
    })
    .filter(Boolean)
    .join("\n\n");
}
