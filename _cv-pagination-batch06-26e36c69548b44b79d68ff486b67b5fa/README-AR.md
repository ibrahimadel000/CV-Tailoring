# تحديث 06 — صفحات حقيقية أثناء التحرير

تحديث للمشروع الحالي، يتطلب Batch 05 أولاً. ليس مشروعاً مستقلاً.

## النتيجة
- المعاينة تعرض صفحات A4 منفصلة من ملف PDF الحقيقي، لا ورقة HTML طويلة ولا حساباً تقريبياً للارتفاع.
- عدّاد ثابت: 2 pages · A4 لسيرة Alex Morgan التجريبية، وترقيم Page 1 of 2 تحت الورقة وخارج ملف التصدير.
- بعد توقف قصير عن الكتابة (650ms قبل التوليد) يعاد حساب الصفحات. أثناء ذلك يظهر Updating page count بدلاً من ادعاء أن العدد القديم محدث.
- المعاينة والتصدير وفحص PDF تشترك في ملف PDF المولّد نفسه. تغيير النص أو القالب أو الخط أو المسافات يعيد التوليد.
- النقر على عناوين الأقسام يفتح المحرر، وتبقى خيارات التكبير وFit ووضع المعاينة الموسعة وتحديد النص متاحة.
- على الهاتف تبقى تبويبات Edit resume / Live preview، مع الصفحات والفواصل والعدّاد.
- حالات فشل التحميل/عرض الصفحة لها رسائل واضحة وأزرار Retry، دون عدد صفحات وهمي.

## التثبيت
1. نزّل Download JSON backup من قائمة ⋯ واحتفظ به.
2. أوقف خادم التطوير بـ Ctrl+C.
3. ضع CV-Builder-Pagination-Batch-06.zip داخل E:\cv tailor - Copy. لا تفكّه يدوياً.
4. الصق الكود كاملاً في PowerShell:

```powershell
$ErrorActionPreference = "Stop"
$project = "E:\cv tailor - Copy"
$zip = Join-Path $project "CV-Builder-Pagination-Batch-06.zip"
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "ZIP not found in the project folder." }
Set-Location -LiteralPath $project
$folder = Join-Path $project ("_cv-pagination-batch06-" + [guid]::NewGuid().ToString("N"))
Expand-Archive -LiteralPath $zip -DestinationPath $folder
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder "Apply-UI.ps1") -ProjectPath $project
if ($LASTEXITCODE -ne 0) { throw "Update stopped. Send the error; do not overwrite files manually." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Send the error." }
npm run dev
```

المتوقع: Applied 6 files successfully (أو أقل إذا كانت مطبقة سابقاً). إذا ظهر Local changes detected أو اختلاف package.json، توقف وأرسل الخطأ ولا تفرض الاستبدال.
لا يلزم npm install. استخدم نفس المتصفح وعنوان التشغيل/المنفذ السابق لرؤية السير المحفوظة محلياً.

## حماية البيانات والتراجع
- أربعة ملفات مصدر معدلة وملفان جديدان فقط. لا تغييرات في package.json أو lockfile أو .env أو المخزن أو شكل بيانات السير أو خدمات AI.
- المثبّت يتحقق من كل البصمات قبل التعديل ويحتفظ بالنسخ الأصلية داخل .cv-builder-backups ويطبع المسار.
- Rollback-UI.ps1 داخل النسخة الاحتياطية يدعم التراجع باستخدام -BackupPath، ويتوقف إذا عدّلت الملفات بعد التثبيت.
- لا تُحذف بيانات المتصفح ولا يُرفع محتوى السيرة إلى خدمة جديدة. عامل PDF.js يُقدّم محلياً مع التطبيق، وليس من CDN.

## حدود واضحة
دعم الخطوط في PDF ما زال Latin فقط. عند إدخال العربية أو نص غير مدعوم، يبقى النص وتظهر معاينة HTML مستمرة مع تحذير Unpaginated؛ لا يُعرض عدد صفحات غير دقيق ولا ندّعي دعم تصدير العربية. AI Tailor ودعم العربية في PDF خارج هذه الدفعة.
تحذيرا حجم حزمة PDF وeval السابقان ما زالا موجودين، والبناء ينجح.
