import { useAppStore, DEFAULT_DOCUMENT_THEME } from '@/store/useAppStore';
import { assessImportQuality, buildImportedProfile, CVImportError, importFormat, validateImportText, type ExtractedCV, type ImportFormat } from './cvImportModel';
import { readCVFile } from './cvImportFiles';
import { hasSubstantiveAiContent, mapAiImportToProfile, requestAiImport } from './cvImportAi';
import { autoOptimizeTheme } from './autoLayout';

async function finalizeImport(
  extracted: ExtractedCV,
  fileName: string,
  format: ImportFormat,
  signal: AbortSignal,
) {
  const state = useAppStore.getState();
  const baseImportTheme = {
    ...(state.documentTheme ?? DEFAULT_DOCUMENT_THEME),
    ...(extracted.pageSize ? { pageSize: extracted.pageSize } : {}),
    fontSize: 'medium' as const,
    lineSpacing: 'normal' as const,
    pageMargins: 'normal' as const,
    fitOnePage: false,
    compactCertifications: false,
  };

  let profile = extracted.needsAiVision
    ? null
    : buildImportedProfile(extracted, fileName, format, baseImportTheme);

  const quality = profile
    ? assessImportQuality(profile, extracted)
    : { needsAiFallback: true, reason: 'scanned-or-image', mappedCount: 0, unmappedLines: 0 };

  if (quality.needsAiFallback) {
    let aiParsed = null;
    try {
      aiParsed = await requestAiImport(extracted, signal);
    } catch {
      if (signal.aborted) throw new CVImportError('cancelled', 'Import cancelled. No resume was created.');
    }
    let aiApplied = false;
    if (aiParsed) {
      const candidate = mapAiImportToProfile(aiParsed, extracted, fileName, format, baseImportTheme);
      if (hasSubstantiveAiContent(candidate)) {
        profile = candidate;
        aiApplied = true;
      } else if (extracted.needsAiVision) {
        throw new CVImportError(
          'ocr',
          'No readable resume fields were detected in this scanned file or photo. Try a clearer image or a text PDF/DOCX.',
        );
      }
    } else if (extracted.needsAiVision) {
      throw new CVImportError(
        'ocr',
        'Scanned PDFs and resume photos require the AI import server (GEMINI_API_KEY). Configure the server or upload a text PDF/DOCX.',
      );
    }
    if (!aiApplied && profile?.importedFrom) {
      const alreadyNoted = profile.importedFrom.warnings.some(w => /floating textboxes|review experience/i.test(w));
      if (!alreadyNoted) {
        profile.importedFrom.warnings = [
          'Some sections could not be structured automatically — review Experience and Education placement before tailoring.',
          ...profile.importedFrom.warnings,
        ];
      }
    }
  }

  if (!profile) {
    throw new CVImportError('text', 'This file could not be parsed. Try a text PDF, DOCX, or paste the resume text.');
  }

  const optimized = autoOptimizeTheme(profile, profile.documentTheme ?? baseImportTheme, {
    allowFitOnePage: true,
    allowExpand: true,
    rollbackIfStillOver: true,
  });
  if (optimized.changed) profile.documentTheme = optimized.theme;
  if (signal.aborted) throw new CVImportError('cancelled', 'Import cancelled. No resume was created.');
  useAppStore.setState(current => ({
    profiles: [...current.profiles, profile!],
    activeProfileId: profile!.profileId,
    documentTheme: { ...profile!.documentTheme! },
  }));
  return profile;
}

// Local-first extraction with automatic Tier-2 AI/Vision fallback for scanned/complex/multilingual CVs.
export async function importCVFile(file: File, signal: AbortSignal) {
  const format = importFormat(file.name, file.size);
  const extracted = await readCVFile(file, signal);
  if (signal.aborted) throw new CVImportError('cancelled', 'Import cancelled. No resume was created.');
  return finalizeImport(extracted, file.name, format, signal);
}

export async function importPastedCVText(rawText: string, signal: AbortSignal, title = 'Pasted resume.txt') {
  const text = validateImportText(rawText);
  if (signal.aborted) throw new CVImportError('cancelled', 'Import cancelled. No resume was created.');
  return finalizeImport({ text, warnings: [] }, title, 'txt', signal);
}
