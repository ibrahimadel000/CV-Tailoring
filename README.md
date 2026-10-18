<div align="center">

# ⚡ CV Builder & Tailor

**A privacy-first, client-side resume engine with real-time paginated PDF preview.**

[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Zustand](https://img.shields.io/badge/State-Zustand-443e38?style=for-the-badge)](https://github.com/pmndrs/zustand)
[![Privacy](https://img.shields.io/badge/Storage-IndexedDB_Local-green?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

<p align="center">
  <a href="#-key-highlights">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-getting-started">Quick Start</a> •
  <a href="#-core-modules">Modules</a> •
  <a href="#-privacy-model">Privacy</a>
</p>

---

</div>

## 🎯 Key Highlights

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>📄 True Paginated PDF Preview</h3>
      <ul>
        <li>Uses <code>@react-pdf/renderer</code> and <code>pdfjs-dist</code>.</li>
        <li>Displays actual page splits and page breaks directly in the browser workspace.</li>
        <li>Shared caching key between canvas preview and binary export.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>🎨 Per-Resume Design System</h3>
      <ul>
        <li>Templates: <b>Essential</b>, <b>Editorial</b>, and <b>Compact</b>.</li>
        <li>Independent layout settings, palettes, fonts, and spacing per document.</li>
        <li>Non-blocking aside panel for editing themes without jumping or resetting preview scroll.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>✋ Fluid Section Reordering</h3>
      <ul>
        <li>Physical drag-and-drop mechanism without DOM remounts.</li>
        <li>Preserves active form states and text inputs while sorting.</li>
        <li>Smooth edge scrolling and full keyboard/touch navigation.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>🔒 100% Client-Side Image Suite</h3>
      <ul>
        <li>Client-side cropping, zoom, and framing (Circle / Rounded).</li>
        <li>Compresses images to JPEG 400x400 and strips all EXIF metadata locally.</li>
        <li>No avatars or image files are ever uploaded to any cloud server.</li>
      </ul>
    </td>
  </tr>
</table>

\---

## ⚡ Architecture Flow

```text
  \\\[ User Input / Drag \\\& Drop ]       \\\[ Design Panel (Aside) ]
                │                               │
                ▼                               ▼
       ┌────────────────────────────────────────────────┐
       │             Zustand App Store                  │
       │    (Document State, Themes, Form Schemas)      │
       └───────────────────────┬────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   \\\[ IndexedDB Storage ]               \\\[ PDF Pipeline Worker ]
   ("Saved in this browser")          (@react-pdf + pdfjs-dist)
                                                  │
                                                  ▼
                                      ┌───────────────────────┐
                                      │ Paginated Canvas \\\&    │
                                      │ Instant PDF Download  │
                                      └───────────────────────┘
```

> \\\[!NOTE]
> \\\*\\\*Data Persistence:\\\*\\\* All resumes, avatar assets, and layouts are stored exclusively inside your browser's IndexedDB via `idb-keyval`. Accessing the app on the same local origin/port retains your saved documents intact.

\---

## 🚀 Getting Started

### Prerequisites

* **Node.js**: `v18.0.0` or later
* **Package Manager**: `npm` or `pnpm`

### Installation

```bash
# 1. Clone repository
git clone https://github.com/ibrahimadel000/CV-Tailoring.git

# 2. Enter project directory
cd CV-Tailoring

# 3. Install packages
npm install

# 4. Launch local dev environment
npm run dev
```

Visit `http://localhost:5173` in your browser.

\---

## 📂 Core Modules

<details>
<summary><b>Click to inspect directory structure</b></summary>

```text
src/
├── components/
│   └── builder/
│       ├── BuilderStudio.tsx       # Core layout orchestrator (Editor + Aside + Preview)
│       ├── SectionWorkspace.tsx    # Drag-and-drop card surface
│       ├── SectionEditor.tsx       # Dynamic section editors \\\& field validation
│       ├── PaginatedPreview.tsx    # Multi-page virtualized PDF viewer
│       ├── DesignPanel.tsx         # Template engine, typography, and spacing controls
│       └── PhotoField.tsx          # Local cropper, zoom controls, and canvas processor
├── store/
│   └── useAppStore.ts              # Zustand state engine for multi-resume tracking
├── types/
│   └── schema.ts                   # Strict schema definitions for CV entities
├── utils/
│   ├── pdfPipeline.tsx             # Shared PDF builder \\\& cache hashing
│   ├── photoModel.ts               # Local image parsing, EXIF wipe, and compression
│   └── useBuilderPersistence.ts    # Browser IndexedDB sync connector
└── services/
    └── aiTailor.ts                 # AI tailoring schema \\\& prompt utilities
```

</details>

\---

## 🛡️ Privacy \& Production Notes

* **Zero Data Telemetry:** No user tracking, remote cookies, or off-site data collection.
* **Font Fallback:** Embedded Latin fonts power precise PDF line-heights and text metrics. Non-Latin characters (Arabic/CJK) use localized HTML fallback previewing.
* **AI Tailor Security:** The frontend does not expose raw API keys directly to production bundles. All external LLM operations require an isolated serverless proxy.

\---

<div align="center">

Built with precision for clean, modern careers.

**MIT License** • Maintained by [ibrahimadel000](https://github.com/ibrahimadel000)

</div>

