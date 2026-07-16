# CV Tailor Studio — Definitive Implementation Plan

## What This Is

A standalone React/TypeScript SPA that lets users build a **verified, locked Master Profile** from their CV, then use AI to tailor it against specific Job Descriptions — with **zero hallucination** enforced structurally, not just by prompting. Operates standalone for direct visitors and as the destination UI for a companion browser extension.

---

## 1. The Immutable Grounding Rule

The AI is strictly a **selector, reorderer, and keyword-optimizer**. It is architecturally forbidden from creating new facts, job titles, companies, metrics, dates, or skills.

- If a data point does not exist in the confirmed `MasterProfile`, it cannot exist in any tailored output.
- Fabrication is prevented through **five programmatic layers**, not just prompt engineering.

---

## 2. Tech Stack (Final Decisions)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Language** | TypeScript (`strict: true`) | Enforces schema contracts across the 5-step loop |
| **Framework** | React 19 + Vite | Fast HMR, clean SPA, no SSR overhead needed |
| **Styling** | Tailwind CSS v4 + Shadcn/UI | Rapid card/panel/modal composition. Shadcn gives accessible Radix primitives with Tailwind styling. Shadcn fully supports TW v4's CSS-first `@theme` config. |
| **State Management** | Zustand | Lightweight, TypeScript-native, no boilerplate. Perfect for the three-layer state model (Master → AI → Draft) |
| **Persistence** | IndexedDB via `idb-keyval` | Effectively unlimited storage. `localStorage` hits 5-10MB ceilings with multiple tailored profiles |
| **AI Provider** | Google Gemini via `@google/generative-ai` | Structured output support via `responseMimeType: "application/json"` + `responseSchema`. Used with `gemini-2.5-flash` for speed + cost efficiency |
| **PDF Parsing** | `pdfjs-dist` (Mozilla pdf.js) | Most battle-tested browser-side PDF parser. Handles complex layouts better than alternatives |
| **Diff Engine** | `diff` (jsdiff) with `diffWords()` | Cleaner word-boundary diffs than `diff-match-patch` for this use case. Simpler API |
| **Schema Validation** | `zod` + `zod-to-json-schema` | Runtime validation of AI responses. `zod-to-json-schema` converts Zod schemas to Gemini's `responseSchema` format |
| **PDF Export** | `@react-pdf/renderer` | Client-side React-primitive PDF generation. Single-column ATS-safe output |
| **Sanitization** | `dompurify` | Non-negotiable for scrubbed JD payloads from the extension |
| **Icons** | `lucide-react` | Lightweight, tree-shakeable icon set |
| **Utilities** | `clsx`, `tailwind-merge`, `uuid` | Class merging, unique ID generation |
| **Vite Plugin** | `vite-plugin-node-polyfills` | **Mandatory.** `@react-pdf/renderer` depends on Node.js built-ins (`Buffer`, `stream`, `process`) that Vite doesn't polyfill. Without this plugin, `npm run build` crashes with `"Buffer is not defined"` |

> [!CAUTION]
> **Known Integration Hazard #1 — Vite + pdfjs-dist Worker**: `pdfjs-dist` relies on a separate Web Worker file (`pdf.worker.js`) for background PDF parsing. Vite's ESM bundler **will lose track of this file path** during production builds, causing a silent crash or white screen when users upload a PDF. The worker must be initialized using Vite's static asset URL import syntax (see Step 1 and Phase 2 for the exact fix).
>
> **Known Integration Hazard #2 — Vite + @react-pdf/renderer Polyfills**: `@react-pdf/renderer` internally uses Node.js built-in modules (`Buffer`, `stream`, `process`, `zlib`). Vite does **NOT** polyfill these, unlike Webpack/CRA. Without `vite-plugin-node-polyfills`, the app will crash on `npm run build` or at runtime with `"Buffer is not defined"`. This must be configured in `vite.config.ts` during Phase 1 (see exact config below).
>
> **Known Integration Hazard #3 — @react-pdf/renderer Font Race**: `Font.register()` loads `.ttf` files asynchronously. If `<PDFViewer>` renders before fonts finish loading, the layout engine calculates spacing with fallback metrics, producing broken text overlap and pagination errors. A font-ready gate is required (see Step 5 and Phase 5).

**Mandatory `vite.config.ts` setup (Phase 1):**

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,    // Required by @react-pdf/renderer
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
});
```

> [!WARNING]
> **API Key Exposure (Local Dev Only)**: The `@google/generative-ai` SDK runs client-side, meaning the Gemini API key will be visible in browser DevTools network requests. For local development this is acceptable. Before any future deployment, the AI calls **must** be moved behind a backend proxy or serverless function (e.g., Vercel Edge Function) to protect the API key.

> [!IMPORTANT]
> **Why Zustand over React Context?** The three-layer state model (MasterProfile + TailoredProfile + WorkingDraft) with debounced diff computation creates complex cross-cutting state updates. Zustand handles this cleanly with slices and selectors, avoiding Context's re-render cascading problem. Using React Context here would cause the entire diff panel to re-render on every keystroke.

---

## 3. TypeScript Schema (Corrected & Complete)

The original plan's schema was a solid starting point. The corrections below fix three gaps: (1) missing three-layer state for diff tracking, (2) `education` should not reuse `ExperienceCard` — degrees aren't "experience", (3) the `TailoredBullet` needs the full `original → ai → userEdit` lifecycle.

```typescript
// src/types/schema.ts

// ── Atomic Units ──

export interface BulletPoint {
  id: string;          // UUID, assigned at parse time, stable forever
  text: string;        // The actual accomplishment string
  isVerified: boolean; // Must be true before profile can be locked
}

export interface ExperienceEntry {
  id: string;
  roleTitle: string;
  companyName: string;
  startDate: string;       // "Jan 2022" format
  endDate: string;         // "Present" | "Dec 2024"
  bullets: BulletPoint[];
}

export interface EducationEntry {
  id: string;
  degree: string;          // "B.Sc. Computer Science"
  institution: string;     // "MIT"
  graduationDate: string;
  gpa?: string;
  honors?: string[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  role?: string;
  url?: string;
  bullets: BulletPoint[];
}

export interface SkillTag {
  id: string;
  name: string;
  category: "Technical" | "Soft" | "Tools" | "Languages";
}

// ── Section Wrapper ──

export interface SectionBlock<T> {
  id: string;
  title: string;    // "Work Experience", "Skills", etc.
  isLocked: boolean;
  data: T;
}

// ── Master Profile (The Single Source of Truth) ──

export interface MasterProfile {
  profileId: string;
  version: number;
  lastConfirmed: string;     // ISO date string
  summary: SectionBlock<string>;
  experience: SectionBlock<ExperienceEntry[]>;
  skills: SectionBlock<SkillTag[]>;
  education: SectionBlock<EducationEntry[]>;
  projects: SectionBlock<ProjectEntry[]>;
}

// ── Entity Whitelist (Extracted from locked MasterProfile) ──

export interface MasterProfileEntities {
  companyNames: Set<string>;
  jobTitles: Set<string>;
  technologies: Set<string>;
  metrics: Set<string>;         // "150%", "$2M", "50+"
  properNouns: Set<string>;     // capitalized terms that aren't sentence-starters
  allText: string;              // flattened text for substring fallback checks
}

// ── Three-Layer Bullet State (for Review stage) ──

export interface ReviewBulletState {
  id: string;                       // maps to BulletPoint.id
  sourceBulletId: string;           // MUST exist in MasterProfile
  original: string;                 // frozen text from MasterProfile
  aiTailored: string;              // AI's version, frozen after generation
  userEdited: string;              // live draft — the ONLY mutable field
  diffTokens: DiffToken[];        // cached word-level diff result
  status: "pending" | "accepted" | "rejected";
  validationFlags: ValidationFlag[];
}

export interface DiffToken {
  text: string;
  type: "added" | "removed" | "unchanged";
}

export interface ValidationFlag {
  type: "fabricated_metric" | "unknown_proper_noun" | "unknown_technology" | "substantially_altered";
  value: string;
  severity: "critical" | "warning";
  dismissed: boolean;    // user can explicitly acknowledge and dismiss
}

// ── Tailored Output ──

export interface TailoredProfile {
  id: string;
  masterProfileId: string;        // links back to which Master was used
  jobDescription: string;         // the raw JD text
  jobTitle: string;               // extracted from JD
  company: string;                // extracted from JD
  createdAt: string;
  matchScore: number;             // 0-100 relevance score
  missingSkills: string[];        // honest gap analysis
  summary: string;                // tailored summary text
  experience: ReviewBulletState[][];  // array of entries, each containing array of bullets
  selectedExperienceIds: string[];    // which experience entries the AI chose to include
  selectedProjectIds: string[];       // which project entries the AI chose to include
}

// ── App State (Zustand Store Shape) ──

export type AppStep = "edit" | "confirm" | "tailor" | "review" | "export";

export interface AppState {
  currentStep: AppStep;
  masterProfile: MasterProfile | null;
  tailoredProfile: TailoredProfile | null;
  jobDescription: string | null;
  extensionConnected: boolean;
  extensionToken: string | null;
}
```

> [!NOTE]
> **Key corrections from the original plan:**
> - `EducationEntry` is its own type — degrees have `institution`, `gpa`, `honors`, not `roleTitle`/`companyName`.
> - `ReviewBulletState` carries the full three-layer state (`original` → `aiTailored` → `userEdited`) so diff tracking works correctly during inline editing.
> - `ValidationFlag` with `dismissed: boolean` ensures users must explicitly acknowledge every red flag before export.
> - `MasterProfileEntities` is computed at CONFIRM time and used as the hallucination whitelist.
> - `version` field on MasterProfile enables profile evolution over time.

---

## 4. The 5-Step Workflow (Corrected Architecture)

### Step 1: EDIT (Ingestion & Setup)

**Two entry paths:**
- **Upload Path**: User uploads a PDF. `pdfjs-dist` extracts text. A parsing function splits text into sections and populates modular editable cards.
- **Manual Path**: User starts from a blank canvas and fills in cards directly.

**⚠️ pdfjs-dist Worker Initialization (MANDATORY):**

`pdfjs-dist` uses a Web Worker for background PDF parsing. Vite will lose track of the worker file path in production builds unless explicitly configured using Vite's static asset URL import:

```typescript
// src/services/pdfParser.ts — MUST be the first thing in this file
import * as pdfjsLib from 'pdfjs-dist';
import { GlobalWorkerOptions } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
```

Without this, PDF upload will silently fail with a white screen or console error in production. The `import.meta.url` syntax tells Vite to treat the worker as a static asset and include it in the build output.

**Component architecture:**
- `ProfileBuilderView.tsx` — page-level orchestrator
- `SummaryEditor.tsx` — auto-resizing textarea for the profile summary
- `ExperienceCardEditor.tsx` — form card for one role: Role Title, Company, Date Range, + an array of `BulletInput` sub-components
- `EducationCardEditor.tsx` — form card for one degree (separate from Experience)
- `ProjectCardEditor.tsx` — form card for one project with bullet inputs
- `SkillTagEditor.tsx` — interactive chip container, Enter to add, click to remove, drag to reorder
- `BulletInput.tsx` — individual auto-resizing textarea for one bullet point, with Delete / Move Up / Move Down controls

**Critical rules:**
- Each bullet point is its own separate input field with its own UUID.
- Users can add, delete, reorder, merge, and split bullets freely.
- PDF parsing always shows extracted results for the user to verify — never silently trusted.
- Offer **manual paste** as a fallback for PDFs that parse badly.

---

### Step 2: CONFIRM (Lock the Master Profile)

**Action:** User walks through each section card, verifies inline facts, and clicks "Confirm & Lock Master Profile."

**What happens on confirm:**
1. Every `BulletPoint.isVerified` is checked — all must be `true` or the user is prompted.
2. All section `isLocked` flags flip to `true`.
3. `MasterProfile.version` increments, `lastConfirmed` updates.
4. The locked profile is persisted to **IndexedDB** via `idb-keyval`.
5. A `MasterProfileEntities` whitelist is computed and cached — extracting all company names, metrics, proper nouns, technologies, and job titles using regex + word boundary analysis.

**State transition:** `currentStep` moves from `"edit"` → `"confirm"`.

**Re-editing:** User can unlock and return to EDIT at any time. Previous version is preserved in IndexedDB (last 3 versions kept for undo).

---

### Step 3: TAILOR (AI + Extension Bridge)

**Two trigger paths:**
1. **Manual**: User pastes a Job Description directly into a textarea in the app.
2. **Extension**: The companion browser extension sends a scraped JD via the hybrid handshake protocol (see Section 5). The extension is already built — the web app just needs to listen for `postMessage` payloads.

**AI Provider: Google Gemini (via `@google/generative-ai` SDK)**

The API key is stored in `.env` as `VITE_GEMINI_API_KEY` (Vite requires the `VITE_` prefix for client-side env vars). The SDK is initialized once:

```typescript
// src/services/aiTailor.ts
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
```

**Gemini Structured Output Configuration:**

Gemini supports native JSON mode via `responseMimeType: "application/json"` + a `responseSchema`. This dramatically reduces (but does not eliminate) malformed JSON output:

```typescript
const result = await model.generateContent({
  contents: [{ role: 'user', parts: [{ text: prompt }] }],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: tailoredProfileSchema, // Generated from Zod via zod-to-json-schema
  },
});

const rawText = result.response.text();
// STILL pass through aiResponseCleaner.ts as a safety net
const validated = parseAIResponse(rawText, tailoredProfileZodSchema);
```

Use `zod-to-json-schema` to convert your Zod schemas into the OpenAPI-style JSON Schema that Gemini's `responseSchema` expects. This keeps a single source of truth for your schema definitions.

**AI processing (two-phase):**

**Phase 1 — Selection & Ranking:**
- AI receives the locked `MasterProfile` JSON and the raw JD text.
- AI selects which experience entries and project entries are most relevant.
- AI ranks/reorders bullets within each selected entry by JD relevance.
- AI identifies missing skills (honest gap analysis).
- AI returns structured JSON matching the `TailoredProfile` schema.

**Phase 2 — Keyword Optimization:**
- For each selected bullet, AI rewrites to incorporate JD keywords while preserving the original meaning.
- AI must echo back the `sourceBulletId` and `originalText` for each bullet.
- Output is structured JSON enforced by Gemini's `responseSchema`.

**⚠️ AI JSON Response Cleaning (MANDATORY):**

LLMs frequently corrupt their own JSON output in three ways:
1. Wrapping output in markdown code fences (`` ```json ... ``` ``)
2. Prepending/appending conversational text ("Here is the JSON:" or "Let me know if...")
3. Including trailing commas, unescaped characters, or partial objects on timeout

The `aiTailor.ts` service must implement a **response-cleaning pipeline** before any `JSON.parse()` call:

```typescript
// src/services/aiResponseCleaner.ts
import { z } from 'zod';

// Step 1: Strip markdown code fences and conversational wrapper text
function extractJSON(raw: string): string {
  // Remove ```json ... ``` wrapping
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  
  // Find the first { or [ and last } or ]
  const firstBrace = raw.search(/[{\[]/);
  const lastBrace = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  if (firstBrace !== -1 && lastBrace !== -1) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  
  return raw; // Let JSON.parse fail with a clear error
}

// Step 2: Parse with Zod schema validation
function parseAIResponse<T>(raw: string, schema: z.ZodType<T>): T {
  const cleaned = extractJSON(raw);
  const parsed = JSON.parse(cleaned);  // throws on malformed JSON
  return schema.parse(parsed);         // throws on schema mismatch
}
```

If using OpenAI or Google Gemini, **prefer their native Structured Outputs / JSON mode** to reduce (but not eliminate) the need for cleaning. The cleaning pipeline is still mandatory as a safety net.

**Post-AI Validation Pipeline (5 Layers):**

| Layer | What It Does | Failure Mode |
|-------|-------------|--------------|
| **0. JSON Cleaning** | Strip markdown fences, extract JSON, validate against Zod schema. | Show error toast with retry button. Never pass malformed data to the store. |
| **1. Schema Validation** | Every `sourceBulletId` must map to a real Master Profile bullet. `originalText` echo must match stored original exactly. No invented bullet IDs. | Strip invalid bullets, replace with originals |
| **2. Entity Whitelist** | Extract proper nouns, metrics, technologies from AI output. Compare against `MasterProfileEntities` whitelist computed at CONFIRM. | Flag unrecognized entities as `ValidationFlag` |
| **3. Metric Guard** | Regex-extract all numbers/percentages/dollar amounts from AI output. Every one must exist in the Master Profile. | Flag fabricated metrics as `critical` severity |
| **4. Structural Integrity** | No new experience entries, no new companies, no new date ranges. The AI can only select/reorder/rephrase what exists. | Strip any structurally invalid additions |
| **5. UI Flagging** | All surviving `ValidationFlag` items are attached to their bullets and displayed as red highlights. User must dismiss each one explicitly. | Export button disabled until all flags resolved |

> [!IMPORTANT]
> Prompt engineering is Layer 0 — necessary but **never sufficient**. The six layers above are the real defense. The AI **will** embellish if given the chance.

---

### Step 4: REVIEW (Side-by-Side Comparison Studio)

**Layout:** Two-column split view.

```
┌─────────────────────────────────────────────────────────┐
│  Master Profile (Read-Only)   │  Tailored Draft (Live)  │
│                               │                         │
│  [Summary]                    │  [Summary w/ diff]      │
│  [Experience 1]               │  [Experience 1 w/ diff] │
│    • bullet (original)        │    • bullet (edited)    │
│    • bullet (original)        │    [Accept] [Reject]    │
│  [Experience 2]               │  [Experience 2 w/ diff] │
│                               │                         │
│  Scroll-locked to right panel │  Inline editable        │
└─────────────────────────────────────────────────────────┘
```

**Diff rendering strategy:**
- Diff is always computed between `original` and `userEdited` (not `original` and `aiTailored`).
- `userEdited` is initialized to `aiTailored` when the AI result arrives.
- Diff recomputation is **debounced at 300ms** after the last keystroke.
- Diff tokens are **cached in state** and only recomputed when `userEdited` changes.
- The diff overlay (colored highlights) is a **separate read-only element** from the editable textarea. They are stacked vertically — diff display above, edit field below. This prevents cursor-jump bugs.

**⚠️ Diff Token Flickering Prevention (MANDATORY):**

`jsdiff`'s `diffWords()` splits on whitespace and punctuation boundaries. When a user is mid-keystroke (e.g., typing "auto-" before finishing "auto-scaling"), the diff engine sees a hyphen as a word boundary and fractures the token, causing the highlight to flicker, split words, and jump around. This is a major UX problem.

**Three-part fix in `useDebouncedDiff.ts`:**

```typescript
// src/hooks/useDebouncedDiff.ts

function useDebouncedDiff(original: string, userEdited: string) {
  const [diffTokens, setDiffTokens] = useState<DiffToken[]>([]);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // FIX 1: Don't recompute while user is actively typing
    // The 300ms debounce timer resets on every keystroke.
    // Diff only fires 300ms AFTER the user stops typing.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      // FIX 2: Normalize punctuation before diffing.
      // Collapse hyphens, slashes, and special chars into the
      // adjacent word so diffWords() doesn't fracture mid-token.
      const normalizeForDiff = (text: string) =>
        text.replace(/([\w])([\-\/])([\w])/g, '$1$2$3'); // keep compound words atomic

      const result = diffWords(
        normalizeForDiff(original),
        normalizeForDiff(userEdited)
      );

      setDiffTokens(result.map(part => ({
        text: part.value,
        type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
      })));
    }, 300);

    return () => clearTimeout(debounceTimerRef.current);
  }, [original, userEdited]);

  // FIX 3: Expose focus handlers for the parent component.
  // When input loses focus, force one final diff computation
  // so the display is always up-to-date when the user moves on.
  const onInputFocus = () => setIsInputFocused(true);
  const onInputBlur = () => {
    setIsInputFocused(false);
    // Force immediate recompute on blur
    clearTimeout(debounceTimerRef.current);
    // ... trigger diff immediately
  };

  return { diffTokens, onInputFocus, onInputBlur };
}
```

The key insight: the debounce timer alone is insufficient because `diffWords()` will still fracture compound words (`CI/CD`, `auto-scaling`, `Node.js`) at punctuation boundaries even on a fully-committed string. The normalization pass keeps these tokens atomic.

**Color coding:**
- 🟢 **Green**: Words added (JD keywords injected) — this is the intended behavior.
- 🔴 **Red/Strikethrough**: Words removed from original.
- 🔵 **Blue**: Reordered or restructured content.
- 🔴🚩 **Red flag icon**: `ValidationFlag` — unrecognized entity. Must be dismissed before export.

**Per-bullet controls:**
- `[Accept]` — locks this bullet's `userEdited` as the final version.
- `[Reject]` — reverts `userEdited` to `original` (discards AI changes for this bullet).
- Inline text editing — user can type directly to modify the AI's version.

---

### Step 5: EXPORT (ATS-Clean PDF Render)

**Component architecture:**
- `ResumePDFTemplate.tsx` — `@react-pdf/renderer` `<Document>`, `<Page>`, `<View>`, `<Text>` components.
- `PDFPreviewModal.tsx` — modal with live `<PDFViewer>` preview + "Download PDF" button.

**PDF guardrails (architected from day 1):**

| Issue | Defense |
|-------|---------|
| **Content clipping** | Set `wrap={true}` explicitly on every `<View>`. Default is `false` — this silently clips content. |
| **Orphaned headers** | `minPresenceAhead={80}` on every section header `<View>`. |
| **Font rendering** | Register `.ttf` font files locally (Inter or similar). Never use Google Fonts URLs (they return CSS, not font files). Only `.ttf`/`.otf` supported. |
| **ATS compatibility** | Single-column only. No images, icons, tables, or decorative elements. Section headers as bold text, not styled boxes. |
| **Performance** | Use `pdf().toBlob()` imperative API. Show loading spinner during generation. |
| **Layout mismatch** | PDF template has its own independent spacing system. Never try to replicate browser layout. |
| **Font loading race** | Gate `<PDFViewer>` behind a `fontsReady` boolean. Never render the PDF component until all fonts are confirmed loaded. |

**⚠️ Font Loading Race Condition Fix (MANDATORY):**

`@react-pdf/renderer`'s `Font.register()` triggers asynchronous font binary downloads. If `<PDFViewer>` mounts before the fonts finish loading, the layout engine calculates text widths and line breaks using fallback font metrics. When the real fonts load moments later, the text doesn't re-layout — resulting in overlapping characters, broken pagination, and mangled spacing.

```typescript
// src/hooks/useFontLoader.ts
import { Font } from '@react-pdf/renderer';
import { useState, useEffect } from 'react';

// Register fonts at module scope (runs once on import)
Font.register({
  family: 'Inter',
  fonts: [
    { src: '/fonts/Inter-Regular.ttf', fontWeight: 'normal' },
    { src: '/fonts/Inter-Bold.ttf', fontWeight: 'bold' },
    { src: '/fonts/Inter-Italic.ttf', fontStyle: 'italic' },
  ],
});

export function useFontLoader(): boolean {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    // Preload all registered font files into browser memory
    Promise.all([
      fetch('/fonts/Inter-Regular.ttf'),
      fetch('/fonts/Inter-Bold.ttf'),
      fetch('/fonts/Inter-Italic.ttf'),
    ])
      .then(() => setFontsReady(true))
      .catch((err) => {
        console.error('Font loading failed:', err);
        setFontsReady(true); // Degrade gracefully with fallback fonts
      });
  }, []);

  return fontsReady;
}
```

```tsx
// src/components/pdf/PDFPreviewModal.tsx
function PDFPreviewModal() {
  const fontsReady = useFontLoader();

  if (!fontsReady) {
    return <LoadingSkeleton message="Loading PDF fonts..." />;
  }

  return <PDFViewer>...</PDFViewer>;  // Safe — fonts are guaranteed loaded
}
```

The `useFontLoader` hook must be called at the root of any component that renders `<PDFViewer>` or calls `pdf().toBlob()`. The PDF component tree must **never mount** until `fontsReady === true`.

**Extension sync:** If the session was initiated by the extension (`?action=import&token=xxx`), offer to send the generated PDF Blob back to the extension via `postMessage` for automated form filling.

---

## 5. Extension-to-Web Handshake Protocol

> [!WARNING]
> The original plan suggested using URL query parameters (`?jd=...`) to pass full JD text. This **will break** — JDs can be 3,000-5,000 characters, exceeding URL length limits. JD text in URLs also leaks into browser history, server logs, and analytics.

**Corrected architecture: Hybrid approach.**

URL carries only a lightweight action trigger + correlation token. The full JD payload travels via `postMessage`.

```
Extension                              Web App
────────                              ───────
1. User clicks "Send to CV Tailor"
2. Extension opens/focuses web app
   URL: app.com/?action=import&token=abc123

3. Extension polls with postMessage:    4. App mounts, registers listener
   { type: 'PING' }                    5. Receives PING, responds:
   (every 200ms, max 10 retries)          { type: 'READY' }

6. Extension receives READY, sends:
   { type: 'JD_IMPORT',
     token: 'abc123',
     payload: '<full JD text>' }

7.                                      8. App validates:
                                           - event.origin matches extension ID
                                           - event.data.token matches URL token
                                           - DOMPurify.sanitize(payload, { ALLOWED_TAGS: [] })
                                           - payload.length < 50,000
                                        9. App parses JD, triggers Step 3
```

**Security requirements:**
- **Origin validation**: Only accept messages from `chrome-extension://YOUR_EXTENSION_ID`.
- **Token correlation**: One-time token in URL must match token in `postMessage` payload.
- **DOMPurify sanitization**: Strip ALL HTML tags. The extension scrapes arbitrary HTML from job portals — XSS payloads are possible.
- **Size limit**: Reject payloads over 50KB.

---

## 6. File & Folder Structure

```
/
├── .env                               # VITE_GEMINI_API_KEY=your_key_here
├── .env.example                       # Template for team members (key placeholder)
├── .gitignore                         # Must include .env
├── vite.config.ts                     # React plugin + nodePolyfills plugin
├── tsconfig.json                      # strict: true
├── public/
│   └── fonts/                         # Inter .ttf files for @react-pdf/renderer
│       ├── Inter-Regular.ttf
│       ├── Inter-Bold.ttf
│       └── Inter-Italic.ttf
│
└── src/
    ├── types/
    │   └── schema.ts                  # All TypeScript interfaces + Zod schemas
    │
    ├── store/
    │   ├── useAppStore.ts             # Zustand store — app step, profile state
    │   ├── useReviewStore.ts          # Zustand store — review bullet states, diff cache
    │   └── slices/                    # Store slices if complexity grows
    │
    ├── services/
    │   ├── pdfParser.ts               # pdfjs-dist wrapper + worker init (import.meta.url)
    │   ├── bulletSplitter.ts          # Intelligent bullet point detection
    │   ├── entityExtractor.ts         # Extracts MasterProfileEntities whitelist
    │   ├── aiTailor.ts                # Gemini API call via @google/generative-ai
    │   ├── aiResponseCleaner.ts       # Strip markdown fences, extract JSON, Zod validate
    │   ├── validator.ts               # 5-layer post-AI validation pipeline
    │   ├── diffEngine.ts              # jsdiff diffWords wrapper + punctuation normalizer
    │   └── extensionBridge.ts         # postMessage listener, handshake protocol
    │
    ├── components/
    │   ├── layout/
    │   │   ├── AppShell.tsx            # Top-level layout, step navigation
    │   │   └── StepIndicator.tsx       # Visual progress through 5 steps
    │   │
    │   ├── editors/
    │   │   ├── BulletInput.tsx         # Single bullet textarea + controls
    │   │   ├── SummaryEditor.tsx       # Summary section editor
    │   │   ├── ExperienceCardEditor.tsx # One experience entry editor
    │   │   ├── EducationCardEditor.tsx # One education entry editor
    │   │   ├── ProjectCardEditor.tsx   # One project entry editor
    │   │   └── SkillTagEditor.tsx      # Chip-based skill tag editor
    │   │
    │   ├── diff/
    │   │   ├── WordDiffDisplay.tsx     # Read-only colored diff token renderer
    │   │   ├── DiffBulletCard.tsx      # Diff display + editable input + Accept/Reject
    │   │   └── ValidationFlagBadge.tsx # Red flag indicator for unverified entities
    │   │
    │   ├── pdf/
    │   │   ├── ResumePDFTemplate.tsx   # @react-pdf/renderer document template
    │   │   └── PDFPreviewModal.tsx     # Preview modal with font-ready gate
    │   │
    │   └── shared/
    │       ├── Card.tsx                # Reusable card wrapper (Shadcn)
    │       ├── Button.tsx              # Themed button (Shadcn)
    │       ├── Modal.tsx               # Accessible modal (Shadcn Dialog)
    │       └── Toast.tsx               # Notification toasts
    │
    ├── views/
    │   ├── ProfileBuilderView.tsx      # Step 1 & 2: Edit + Confirm
    │   ├── TailorView.tsx              # Step 3: JD input + AI trigger
    │   ├── ComparisonStudioView.tsx    # Step 4: Side-by-side review
    │   └── ExportView.tsx              # Step 5: PDF preview + download
    │
    ├── hooks/
    │   ├── useDebouncedDiff.ts         # Focus-aware debounced diff with punctuation normalization
    │   ├── useFontLoader.ts            # Font loading gate for @react-pdf/renderer
    │   ├── usePDFGeneration.ts         # PDF generation lifecycle hook
    │   └── useExtensionBridge.ts       # Extension connection hook
    │
    ├── lib/
    │   └── utils.ts                    # clsx + tailwind-merge helper
    │
    ├── mock/
    │   └── profile.ts                  # Mock MasterProfile for offline development
    │
    ├── App.tsx                         # Root component, step routing
    ├── main.tsx                        # Entry point
    └── index.css                       # Tailwind v4 @theme + custom design tokens
```

---

## 7. Phased Implementation Roadmap

### Phase 1: Foundation (Project Init + Schema + Design System)

- [ ] Initialize Vite + React + TypeScript project with Tailwind CSS v4
- [ ] Install production dependencies:
  ```bash
  npm install lucide-react clsx tailwind-merge @react-pdf/renderer idb-keyval diff pdfjs-dist dompurify uuid zustand zod zod-to-json-schema @google/generative-ai
  ```
- [ ] Install dev dependencies (TypeScript types + Vite polyfill plugin):
  ```bash
  npm install -D vite-plugin-node-polyfills @types/diff @types/dompurify @types/uuid
  ```
- [ ] **Configure `vite.config.ts`** with `vite-plugin-node-polyfills` (see Section 2 for exact config). This is **non-negotiable** — without it, `@react-pdf/renderer` will crash the build with `"Buffer is not defined"`.
- [ ] Create `.env` with `VITE_GEMINI_API_KEY=your_key_here` and `.env.example` as a template. Add `.env` to `.gitignore`.
- [ ] Set up Shadcn/UI components (Button, Card, Dialog, Input, Accordion) via `npx shadcn@latest init`. The CLI auto-detects Tailwind v4 and uses CSS-first `@theme` configuration.
- [ ] Create `src/types/schema.ts` with all TypeScript interfaces AND corresponding Zod schemas from Section 3
- [ ] Create `src/store/useAppStore.ts` — Zustand store with initial state
- [ ] Create `src/mock/profile.ts` — realistic mock MasterProfile for offline dev
- [ ] Create `src/lib/utils.ts` — clsx + tw-merge utility
- [ ] Set up `index.css` with Tailwind v4 `@theme inline` design tokens (colors, spacing, typography)
- [ ] Build `AppShell.tsx` and `StepIndicator.tsx` — the outer layout

**Verify:** `npx tsc --noEmit` — zero errors. `npm run dev` — app renders. `npm run build` — **must pass without polyfill errors**. If you see `"Buffer is not defined"` or `"process is not defined"`, the `vite-plugin-node-polyfills` config is wrong.

---

### Phase 2: Edit & Confirm (Steps 1-2)

- [ ] Build `BulletInput.tsx` — auto-resizing textarea with delete/move controls
- [ ] Build `SummaryEditor.tsx` — summary section textarea
- [ ] Build `ExperienceCardEditor.tsx` — role/company/dates form + bullet array
- [ ] Build `EducationCardEditor.tsx` — degree/institution/graduation form
- [ ] Build `ProjectCardEditor.tsx` — project name/role + bullet array
- [ ] Build `SkillTagEditor.tsx` — interactive chip container with categories
- [ ] Build `ProfileBuilderView.tsx` — assembles all section editors
- [ ] Build `src/services/pdfParser.ts` — pdfjs-dist wrapper with **explicit worker initialization via `import.meta.url`** (see Step 1 for exact code). Verify PDF upload works in both `npm run dev` AND `npm run build` + preview.
- [ ] Build `src/services/bulletSplitter.ts` — intelligent bullet detection with user-adjustable splits
- [ ] Implement "Confirm & Lock" flow — verification checks, IndexedDB persistence
- [ ] Build `src/services/entityExtractor.ts` — extracts `MasterProfileEntities` whitelist on confirm

**Verify:** `npx tsc --noEmit`. Can create a profile from scratch, upload a PDF, edit all sections, confirm & lock. Profile persists across page refresh. **CRITICAL: Run `npm run build && npx vite preview` and test PDF upload in the production build.** The pdfjs-dist worker crash only manifests in production, not dev mode.

---

### Phase 3: AI Tailoring Engine (Step 3)

- [ ] Build `src/services/aiResponseCleaner.ts` — markdown fence stripping, JSON extraction, Zod schema validation (see Step 3 for exact code). Define Zod schemas mirroring the `TailoredProfile` TypeScript interfaces.
- [ ] Build `src/services/aiTailor.ts` — structured JSON prompt, two-phase AI call. **All AI responses must pass through `aiResponseCleaner.ts` before `JSON.parse()`.** Implement retry logic (max 2 retries) if Zod validation fails.
- [ ] Build `src/services/validator.ts` — full 5-layer validation pipeline (Layer 0: JSON cleaning is now in `aiResponseCleaner.ts`, Layers 1-5 in `validator.ts`)
- [ ] Build `TailorView.tsx` — JD input textarea + "Tailor My CV" trigger button. Show clear error toast with "Retry" button if AI response fails JSON cleaning.
- [ ] Build `src/services/extensionBridge.ts` — postMessage listener + handshake protocol
- [ ] Build `src/hooks/useExtensionBridge.ts` — React hook wrapping the bridge
- [ ] Wire up JD → AI → Clean → Validate → TailoredProfile pipeline end-to-end

**Verify:** `npx tsc --noEmit`. Pasting a JD triggers AI call, validation runs, TailoredProfile is populated. Fabricated entities are flagged. **Test with deliberately malformed AI responses** (wrap JSON in markdown fences, add conversational text before/after) to verify the cleaner handles all cases.

---

### Phase 4: Comparison Studio (Step 4)

- [ ] Build `src/services/diffEngine.ts` — jsdiff `diffWords()` wrapper with **punctuation normalization** (keep compound words like `CI/CD`, `auto-scaling`, `Node.js` atomic during diff computation). See Step 4 for the `normalizeForDiff()` function.
- [ ] Build `src/store/useReviewStore.ts` — Zustand store for `ReviewBulletState[]` array
- [ ] Build `src/hooks/useDebouncedDiff.ts` — **Focus-aware** 300ms debounced diff hook. Must: (1) reset debounce timer on every keystroke, (2) normalize punctuation before calling `diffWords()`, (3) force immediate recompute on input blur so diff is always current when user moves on.
- [ ] Build `WordDiffDisplay.tsx` — read-only colored diff token renderer (green/red/blue)
- [ ] Build `ValidationFlagBadge.tsx` — red flag indicator for unverified entities
- [ ] Build `DiffBulletCard.tsx` — diff display + editable textarea + Accept/Reject buttons. Wire `onFocus`/`onBlur` handlers from `useDebouncedDiff`.
- [ ] Build `ComparisonStudioView.tsx` — two-column layout, scroll-locked panels, responsive at 1024px+

**Verify:** `npx tsc --noEmit`. Side-by-side view renders. **Rapidly type inside an editable bullet** — diff highlights must NOT flicker or split words mid-keystroke. Highlights update smoothly ~300ms after typing stops. Accept/Reject works per bullet. Red flags display and can be dismissed.

---

### Phase 5: PDF Export (Step 5)

- [ ] Download and bundle Inter font `.ttf` files in `src/components/pdf/fonts/` AND copy them to `public/fonts/` for static serving
- [ ] Build `src/hooks/useFontLoader.ts` — async font preloader that fetches all `.ttf` files and exposes a `fontsReady` boolean. `Font.register()` called at module scope. See Step 5 for exact implementation.
- [ ] Build `ResumePDFTemplate.tsx` — single-column ATS-clean layout with `wrap={true}` on all Views, `minPresenceAhead` on headers
- [ ] Build `PDFPreviewModal.tsx` — **gated behind `useFontLoader()`**. Shows `<LoadingSkeleton>` until `fontsReady === true`, then mounts `<PDFViewer>`. Never render PDF components before fonts are loaded.
- [ ] Build `src/hooks/usePDFGeneration.ts` — generation lifecycle with loading state. Must also check `fontsReady` before calling `pdf().toBlob()`.
- [ ] Build `ExportView.tsx` — preview + download + extension sync
- [ ] Wire extension PDF-back sync via postMessage (if extension-initiated session)

**Verify:** `npx tsc --noEmit`. `npm run build` — clean build, no polyfill errors. PDF renders correctly, no content clipping, proper pagination. **Throttle network to Slow 3G in DevTools and verify the PDF preview shows a loading skeleton (not broken text) while fonts are downloading.** Export downloads a valid PDF.

---

## 8. Verification Checklist (Run After Every Phase)

```bash
# Type safety — zero errors allowed
npx tsc --noEmit

# Production build — no polyfill or bundling errors
npm run build

# Dev server — visual inspection
npm run dev
```

Manual checks per phase:
- **Phase 2**: Create profile → edit all fields → upload PDF → confirm & lock → refresh page → profile persists
- **Phase 3**: Paste JD → AI returns structured result → validator catches fabricated metrics → flags appear
- **Phase 4**: Side-by-side renders → edit right panel → diff updates smoothly → Accept/Reject works → red flags block export until dismissed
- **Phase 5**: PDF preview renders → no content clipped → single-column layout → downloads clean file → ATS parser can read all text

---

## Resolved Decisions

| Question | Decision |
|----------|----------|
| **AI Provider** | **Google Gemini** via `@google/generative-ai` SDK. Model: `gemini-2.5-flash`. Structured output via `responseMimeType: "application/json"` + `responseSchema`. |
| **Deployment** | **Local development only** for now. No deployment target yet. API key stored in `.env` with `VITE_` prefix. Before any future deployment, AI calls must move behind a backend proxy to protect the key. |
| **Extension** | **Already built** (separate project). The web app will implement the `postMessage` listener and handshake protocol to accept JD payloads from it, but will **not** modify or integrate with the extension codebase. |
