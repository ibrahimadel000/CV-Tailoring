# تحديث 03 — السحب والإضافة السريعة

هذا تحديث داخل المشروع الحالي، وليس مشروعاً مستقلاً. يتطلب تثبيت Batch 02 أولاً.

## الجديد
- تبويب Sections يعرض الأقسام كقائمة قابلة للفتح والإغلاق مثل المرجع.
- اسحب مقبض النقاط بجانب القسم إلى موضعه الجديد، من القائمة أو من الشريط الأيسر.
- خط أزرق يحدد موضع الإفلات. يتغير الترتيب عند الإفلات فقط؛ Escape يلغي السحب.
- بالكيبورد: ركّز مقبض القسم، ثم Up / Down أو Home / End. البيانات الشخصية ثابتة أولاً.
- زر Add section الثابت ينقلك مباشرة إلى أزرار الإضافة السريعة.
- Languages / Courses / Internships / Volunteering / Achievements / References / Custom section.
- الإضافات الجديدة هي عنوان قابل للتعديل وفقرات نصية، وليست نماذج متخصصة لكل نوع.
- اضغط اسم القسم لفتحه، أو Focused editor للتركيز على قسم واحد.
- الترتيب محفوظ ويُستخدم في المعاينة وPDF ونسخة JSON.

## التثبيت
1. نزّل نسخة JSON من سيرتك احتياطياً. لا تمسح بيانات المتصفح.
2. أوقف سيرفر التطوير بـ Ctrl+C.
3. ضع CV-Builder-UI-Batch-03.zip في E:\cv tailor - Copy دون فكّه يدوياً.
4. نفّذ الأوامر التالية في PowerShell:

```powershell
$ErrorActionPreference = "Stop"
$project = "E:\cv tailor - Copy"
$zip = Join-Path $project "CV-Builder-UI-Batch-03.zip"
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "ZIP file not found in the project folder." }
Set-Location -LiteralPath $project
$folder = Join-Path $project ("_cv-ui-batch03-" + [guid]::NewGuid().ToString("N"))
Expand-Archive -LiteralPath $zip -DestinationPath $folder
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder "Apply-UI.ps1") -ProjectPath $project
if ($LASTEXITCODE -ne 0) { throw "Update stopped. Send the error; do not overwrite files manually." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Send the error." }
npm run dev
```

يعني نجاح المثبّت: Applied 4 files successfully (أو عدد أقل إذا كان بعضها مطبقاً).
إذا اكتشف تغييرات محلية يتوقف قبل تطبيق الملفات. أرسل الخطأ بدلاً من تجاوز التحقق.

## ماذا يغيّر؟
ملفان معدلان وملفان جديدان فقط. لا يغيّر package.json أو التبعيات أو .env أو قواعد بيانات المتصفح. لا يضيف خدمات AI أو اتصالات خارجية. احتفظ بنفس المتصفح وعنوان التشغيل للوصول إلى السير المحفوظة.

## النسخ الاحتياطي والتراجع
المثبّت يطابق البصمات قبل الكتابة وينشئ نسخة من الملفات داخل .cv-builder-backups ويطبع مسارها.
للتراجع استخدم Rollback-UI.ps1 الموجود في مجلد النسخة مع -BackupPath لذلك المجلد. يتوقف التراجع إذا عدّلت الملفات بعد التثبيت. لا يحذف سيرك من المتصفح.

PDF باللغة العربية ما زال خارج نطاق هذا التحديث؛ قيود الخطوط السابقة لم تتغير.
