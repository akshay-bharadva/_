/**
 * CSV, read by hand.
 *
 * RFC 4180 with the tolerance bank exports need: a byte-order mark at the
 * start, CRLF or LF, quoted cells with embedded commas and doubled quotes,
 * trailing commas, blank lines. Written here rather than added as a
 * dependency — it is sixty lines, and a parser that is wrong about quotes
 * splits "LOBLAWS, TORONTO" into two columns and every amount after it
 * shifts by one.
 */

/** The separator the first line uses most: comma, semicolon or tab. */
function detectDelimiter(text: string): string {
  const end = text.search(/\r?\n/);
  const line = end === -1 ? text : text.slice(0, end);
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === '"') quoted = !quoted;
      else if (!quoted && line[i] === candidate) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Rows of trimmed cells; rows with nothing in them are dropped. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endRow = () => {
    row.push(cell);
    cell = "";
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row.map((value) => value.trim()));
    }
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      endRow();
    } else {
      cell += ch;
    }
  }
  endRow();
  return rows;
}
