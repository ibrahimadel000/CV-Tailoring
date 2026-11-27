import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, FileText, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import type { CVProfile } from '@/types/schema';
import type { DocumentTheme } from '@/store/useAppStore';
import { analyzeAtsReadability, extractPdfAtsText, type ExtractedPdfAtsData } from '@/services/atsPdfCheck';
import { useResumePDF } from './pdfPipeline';

export default function PDFInspection({ profile, theme }: { profile: CVProfile; theme: DocumentTheme }) {
  const result = useResumePDF(profile, theme, true, 0);
  const [url, setUrl] = useState('');
  const [view, setView] = useState<'pdf' | 'ats'>('pdf');
  const [extractedCache, setExtractedCache] = useState<{ blob: Blob; data: ExtractedPdfAtsData } | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState('');
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => {
    if (!result.blob || !result.current) {
      setUrl('');
      setExtractedCache(null);
      setAtsError('');
      setAtsLoading(false);
      return;
    }
    const next = URL.createObjectURL(result.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result.blob, result.current]);

  useEffect(() => {
    if (view !== 'ats' || !result.blob || !result.current) {
      setAtsLoading(false);
      return;
    }
    if (extractedCache?.blob === result.blob) {
      setAtsError('');
      setAtsLoading(false);
      return;
    }
    const targetBlob = result.blob;
    const controller = new AbortController();
    setAtsLoading(true);
    setAtsError('');
    extractPdfAtsText(targetBlob, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        setExtractedCache({ blob: targetBlob, data });
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setAtsError(err instanceof Error ? err.message : 'Could not inspect PDF text.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setAtsLoading(false);
      });
    return () => controller.abort();
  }, [view, result.blob, result.current, extractedCache?.blob]);

  const atsReport = useMemo(() => {
    if (!result.blob || extractedCache?.blob !== result.blob) return null;
    return analyzeAtsReadability(profile, extractedCache.data);
  }, [profile, result.blob, extractedCache]);

  const copyPlainText = async () => {
    if (!atsReport?.extractedText) return;
    try {
      await navigator.clipboard.writeText(atsReport.extractedText);
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1800);
    } catch {
      // Clipboard API unavailable in restricted context
    }
  };

  if (result.error) {
    return (
      <div className="pdf-loading">
        Could not prepare the PDF.
        <button className="secondary-button" onClick={result.retry}>Retry</button>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="pdf-loading">
        <Loader2 size={24} className="spin" />
        Preparing your PDF…
      </div>
    );
  }

  const verdictLabel =
    atsReport?.verdict === 'clean'
      ? 'ATS-ready'
      : atsReport?.verdict === 'mostly'
        ? 'Minor issues'
        : 'Needs attention';

  return (
    <div className="pdf-inspect-shell">
      <div className="pdf-inspect-tabs" role="tablist" aria-label="PDF inspection mode">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'pdf'}
          className={`pdf-inspect-tab ${view === 'pdf' ? 'active' : ''}`}
          onClick={() => setView('pdf')}
        >
          <FileText size={14} />
          PDF Preview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'ats'}
          className={`pdf-inspect-tab ${view === 'ats' ? 'active' : ''}`}
          onClick={() => setView('ats')}
        >
          <ShieldCheck size={14} />
          ATS Text &amp; Checks
          {atsReport && <span className={`ats-tab-pill ${atsReport.verdict}`}>{atsReport.score}/100</span>}
        </button>
      </div>

      {view === 'pdf' ? (
        <iframe title="Final resume PDF" className="actual-pdf" src={url} />
      ) : atsLoading ? (
        <div className="pdf-loading">
          <Loader2 size={20} className="spin" />
          Reading your PDF like an ATS…
        </div>
      ) : atsError ? (
        <div className="pdf-loading">{atsError}</div>
      ) : atsReport ? (
        <div className="ats-panel">
          <div className="ats-summary-bar">
            <span className={`ats-verdict ${atsReport.verdict}`}>
              {verdictLabel} · {atsReport.score}/100
            </span>
            <span className="ats-stats">
              {atsReport.stats.pages} {atsReport.stats.pages === 1 ? 'page' : 'pages'} · {atsReport.stats.words} words · {atsReport.stats.sizeKb} KB
            </span>
            <button type="button" className="text-button ats-copy-btn" onClick={() => void copyPlainText()}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy ATS text'}
            </button>
          </div>

          <div className="ats-grid">
            <div className="ats-checks-col">
              <h4>Readability checks</h4>
              <ul className="ats-checks-list">
                {atsReport.checks.map(item => (
                  <li key={item.id} className={`ats-check-item ${item.severity}`}>
                    <span className="ats-check-icon" aria-hidden="true">
                      {item.severity === 'pass' ? (
                        <CheckCircle2 size={15} />
                      ) : item.severity === 'warning' ? (
                        <AlertTriangle size={15} />
                      ) : (
                        <XCircle size={15} />
                      )}
                    </span>
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ats-text-col">
              <h4>Plain text hiring software reads</h4>
              <pre className="ats-text-box">{atsReport.extractedText || '(No text extracted)'}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
