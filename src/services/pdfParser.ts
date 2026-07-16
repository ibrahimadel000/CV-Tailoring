import * as pdfjsLib from 'pdfjs-dist';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { splitIntoBullets } from './bulletSplitter';
import { v4 as uuidv4 } from 'uuid';
import type { ExperienceEntry, MasterProfile } from '@/types/schema';

// MANDATORY VITE FIX: explicitly load the pdf worker via URL
GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export async function parsePdfToProfile(file: File): Promise<Partial<MasterProfile>> {
  const arrayBuffer = await file.arrayBuffer();
  
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDocument = await loadingTask.promise;
  
  let fullText = '';
  
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => 'str' in item ? item.str : '')
      .join(' ');
    fullText += pageText + '\n';
  }

  return heuristicParse(fullText);
}

/**
 * Very basic heuristic parsing. In a real app, this would use a more
 * sophisticated regex pipeline or an initial AI extraction step (since the user
 * still verifies the Master Profile anyway). For Phase 2, we just attempt
 * to chunk the text and split bullets.
 */
function heuristicParse(text: string): Partial<MasterProfile> {
  // Try to find sections
  const sections = text.split(/(?=EXPERIENCE|EDUCATION|SKILLS|PROJECTS)/i);
  
  const profile: Partial<MasterProfile> = {};

  sections.forEach(section => {
    const lowerSection = section.toLowerCase();
    
    if (lowerSection.startsWith('experience')) {
      const bullets = splitIntoBullets(section.replace(/EXPERIENCE/i, ''));
      const experience: ExperienceEntry[] = [{
        id: uuidv4(),
        roleTitle: 'Imported Role (Please Edit)',
        companyName: 'Imported Company',
        startDate: '',
        endDate: '',
        bullets: bullets.map(text => ({ id: uuidv4(), text, isVerified: false }))
      }];
      profile.experience = {
        id: uuidv4(),
        title: 'Work Experience',
        isLocked: false,
        data: experience
      };
    }
  });

  return profile;
}
