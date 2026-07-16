/**
 * Intelligent bullet point detection and splitting logic.
 * Handles various PDF extraction artifacts like custom bullet characters,
 * numbered lists, and inconsistent spacing.
 */

const BULLET_MARKERS = [
  '•', '·', '▪', '■', '◆', '●', '◦', '○', '⁃', '-', '–', '—', '*', '>', '❖', '➢', '✓'
];

export function splitIntoBullets(text: string): string[] {
  if (!text || !text.trim()) return [];

  // Split by common line break artifacts from PDF extraction
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  
  const bullets: string[] = [];
  let currentBullet = '';

  for (const line of lines) {
    // Check if line starts with a bullet marker or a number followed by dot/parenthesis
    const startsWithBullet = BULLET_MARKERS.some(marker => line.startsWith(marker));
    const startsWithNumber = /^\d+[\.\)]\s/.test(line);

    if (startsWithBullet || startsWithNumber) {
      // If we have an accumulated bullet, save it
      if (currentBullet) {
        bullets.push(cleanBulletText(currentBullet));
      }
      
      // Start a new bullet (stripping the marker)
      let cleanedLine = line;
      if (startsWithBullet) {
        cleanedLine = line.substring(1);
      } else {
        cleanedLine = line.replace(/^\d+[\.\)]\s/, '');
      }
      
      currentBullet = cleanedLine.trim();
    } else {
      // If no marker, it's likely a continuation of the previous bullet
      // due to PDF line wrapping
      if (currentBullet) {
        currentBullet += ' ' + line;
      } else {
        // If there is no current bullet (e.g. first line has no marker), treat as start
        currentBullet = line;
      }
    }
  }

  // Push the final accumulated bullet
  if (currentBullet) {
    bullets.push(cleanBulletText(currentBullet));
  }

  // If we couldn't find any bullet markers but there's text,
  // we might have a single paragraph. Try sentence splitting as fallback.
  if (bullets.length === 1 && bullets[0].length > 150 && !BULLET_MARKERS.some(m => text.includes(m))) {
    return bullets[0]
      .split(/(?<=[.!?])\s+/)
      .map(cleanBulletText)
      .filter(b => b.length > 10); // Filter out tiny fragments
  }

  return bullets;
}

function cleanBulletText(text: string): string {
  return text
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Remove leading/trailing punctuation or spaces
    .replace(/^[\s,;.-]+|[\s,;.-]+$/g, '')
    // Ensure it ends with a period if it doesn't have other terminal punctuation
    .replace(/([^.!?])$/, '$1.')
    .trim();
}
