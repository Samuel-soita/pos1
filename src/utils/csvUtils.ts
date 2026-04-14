/**
 * A robust CSV parser that handles commas inside quotes
 */
export function parseCSV(text: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return [];

  const parseLine = (line: string) => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase());
  
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseLine(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || '';
      });
      return obj;
    });
}
