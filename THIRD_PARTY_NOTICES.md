# Third-party notices

## Reactive Resume — PDF import geometry

The geometry implementation in `src/services/cvImportGeometry.ts` is adapted
from `packages/resume/src/ats-pdf/extract.ts` at commit
`b242aadcf2d5f819090c7aae8006ca8a235035df` of
https://github.com/reactive-resume/reactive-resume .

Adaptations narrow the input types to this application's existing PDF.js data.
Column-aware reading order also uses the approach described in that commit's
`packages/import/src/pdf-lines.ts`. The application keeps its own CV model,
parser, editor, PDF renderer and tailoring workflow. No Forme runtime is added.

MIT License

Copyright (c) 2026 Amruth Pillai

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
