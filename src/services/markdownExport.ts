/**
 * Zero-dependency reading-order Markdown (.md) resume exporter.
 * Adapted from Reactive Resume's packages/resume/src/markdown.ts (MIT License).
 */
import type { CVProfile } from '@/types/schema';
import { contactItems, fullName, headline, resumeBlocks } from '@/components/builder/resumeModel';

function escapeMdLinkText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/[[\]\\]/g, '\\$&');
}

function escapeMdUrl(url: string): string {
  return url.trim().replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s+/g, '%20');
}

function escapeMdHeading(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function escapeMdEmphasis(text: string): string {
  return escapeMdHeading(text).replace(/([*_`\\])/g, '\\$1');
}

export function buildResumeMarkdown(profile: CVProfile): string {
  const lines: string[] = [];
  const name = fullName(profile) || profile.profileName || 'Resume';
  lines.push(`# ${escapeMdHeading(name)}`);

  const role = headline(profile);
  if (role) {
    lines.push('');
    lines.push(`**${escapeMdEmphasis(role)}**`);
  }

  const contacts = contactItems(profile);
  if (contacts.length) {
    lines.push('');
    const formatted = contacts.map(item =>
      item.url
        ? `[${escapeMdLinkText(item.label)}](${escapeMdUrl(item.url)})`
        : escapeMdHeading(item.label),
    );
    lines.push(formatted.join(' · '));
  }

  const blocks = resumeBlocks(profile);
  for (const block of blocks) {
    if (!block.items.length) continue;
    lines.push('');
    lines.push(`## ${escapeMdHeading(block.title)}`);

    if (block.id === 'summary') {
      const summaryText = block.items.map(i => i.text?.trim()).filter(Boolean).join('\n\n');
      if (summaryText) {
        lines.push('');
        lines.push(summaryText);
      }
      continue;
    }

    if (block.id === 'skills') {
      lines.push('');
      for (const item of block.items) {
        const cleanText = item.text ? item.text.replace(/\s+/g, ' ').trim() : '';
        if (item.title && cleanText) {
          lines.push(`- **${escapeMdEmphasis(item.title)}:** ${cleanText}`);
        } else if (cleanText) {
          lines.push(`- ${cleanText}`);
        }
      }
      continue;
    }

    for (const item of block.items) {
      const headingParts: string[] = [];
      if (item.title?.trim()) headingParts.push(escapeMdHeading(item.title));
      if (item.subtitle?.trim()) headingParts.push(escapeMdHeading(item.subtitle));
      if (item.url && item.urlLabel) {
        headingParts.push(`[${escapeMdLinkText(item.urlLabel)}](${escapeMdUrl(item.url)})`);
      } else if (item.urlLabel?.trim()) {
        headingParts.push(escapeMdHeading(item.urlLabel));
      }
      const headingMain = headingParts.join(' — ');
      const dateSuffix = item.date?.trim() ? ` (${escapeMdHeading(item.date)})` : '';

      if (headingMain) {
        lines.push('');
        lines.push(`### ${headingMain}${dateSuffix}`);
      } else if (dateSuffix) {
        lines.push('');
        lines.push(`*${escapeMdEmphasis(item.date!)}*`);
      }

      if (item.text?.trim()) {
        lines.push('');
        lines.push(item.text.trim());
      }

      if (item.bullets?.length) {
        lines.push('');
        for (const bullet of item.bullets) {
          const clean = bullet.replace(/\s+/g, ' ').trim();
          if (clean) lines.push(`- ${clean}`);
        }
      }
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function buildResumeMarkdownBlob(profile: CVProfile): Blob {
  return new Blob([buildResumeMarkdown(profile)], { type: 'text/markdown;charset=utf-8' });
}
