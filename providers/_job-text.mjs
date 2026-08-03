// Shared bounded normalization for free-form provider text.
import { decodeEntities } from './_html-entities.mjs';

export function plainTextFromHtml(value, maxLength = 20_000) {
  if (typeof value !== 'string' || !value) return '';
  const inputLimit = Math.max(maxLength * 5, maxLength);
  const bounded = value.slice(0, inputLimit);
  const withoutActive = bounded.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const withBreaks = withoutActive.replace(/<\/?(?:p|br|div|li|h[1-6]|ul|ol)\b[^>]*>/gi, ' ');
  return decodeEntities(withBreaks.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function boundedStringList(value, maxItems = 20, maxItemLength = 100) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const clean = item.replace(/\s+/g, ' ').trim().slice(0, maxItemLength);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}
