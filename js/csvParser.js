/**
 * RFC 4180 compliant CSV parser and fetcher for static GitHub Pages hosting.
 * Supports UTF-8 BOM stripping, quoted fields with commas, escaped quotes (""),
 * and embedded newlines inside quoted values.
 */

/**
 * Parse a CSV string into an array of row objects keyed by the header row.
 * @param {string} rawText
 * @returns {Array<Record<string, string>>}
 */
export function parseCSV(rawText) {
  if (!rawText) return [];

  // Strip UTF-8 BOM if present (e.g., when saved from Excel)
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (char === '\r') {
      if (text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else if (char === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Push trailing field/row if non-empty
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Remove completely blank trailing rows
  const nonEmptyRows = rows.filter(
    (row) => row.length > 1 || (row.length === 1 && row[0].trim() !== '')
  );

  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map((h) => h.trim());
  const records = [];

  for (let r = 1; r < nonEmptyRows.length; r++) {
    const values = nonEmptyRows[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = values[c] !== undefined ? values[c] : '';
    }
    records.push(obj);
  }

  return records;
}

/**
 * Fetch and parse a CSV file using a relative URL.
 * @param {string} url
 * @returns {Promise<Array<Record<string, string>>>}
 */
export async function loadCSV(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`データの読み込みに失敗しました (${response.status}): ${url}`);
  }
  const text = await response.text();
  return parseCSV(text);
}
