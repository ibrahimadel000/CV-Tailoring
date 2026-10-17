# Batch 11 — الصورة داخل Personal details

تحديث محدود يتطلب Batch 10. يعدّل ستة ملفات ويضيف PhotoField.tsx وphotoModel.ts. لا تغيير للتبعيات أو package.json أو .env أو خدمة AI أو منطق الحفظ العام.

## الاستخدام
افتح Personal details، ثم Add photo، اختر الصورة، اضبط القص، واضغط Use photo. الإضافة اختيارية، ولا تظهر صورة افتراضية داخل CV جديد أو مكان فارغ في PDF عند غيابها.
- يدعم JPG وPNG وWebP، حتى 5MB. يرفض SVG/GIF والملفات التالفة أو غير المدعومة برسالة واضحة، دون مسح صورة محفوظة سابقة.
- قص مربع مع سحب داخل الإطار بالماوس أو اللمس، وتكبير من 1× إلى 3×، ومنزلقات موضع أفقية/رأسية قابلة للتحكم بلوحة المفاتيح، وإعادة ضبط القص.
- شكل دائري أو مربع بحواف ناعمة، مع Change photo وRemove photo وزر Show/Hidden. الإخفاء يحفظ الصورة لكنه يستبعدها من المعاينة وPDF.
- Cancel أو Escape لا يحفظان قصاً جديداً. اختيار الشكل وإظهار/إخفاء الصورة إعدادان مستقلان محفوظان مباشرة. تعديل القص الأصلي لاحقاً يكون باختيار الملف مجدداً عبر Change photo؛ الملف الكامل غير محفوظ لاسترجاع أجزاء سبق قصّها.
- الصورة تظهر في جميع القوالب: بجانب الاسم في Essential/Compact، وأعلى الاسم في Editorial. تحفظ المعاينة والتصدير نفس صورة القص. الصفحة الثانية لا تكرر الصورة تلقائياً.
- يحتفظ كل CV بصورته. نسخ السيرة ينسخ الصورة، وحذفها من النسخة لا يحذفها من الأصل.

## الحفظ والخصوصية
تُعالج الصورة داخل المتصفح وتُحوّل إلى JPEG مربع 400×400، مع ضغط وإزالة بيانات EXIF الوصفية من النسخة المحفوظة. الأصل الكامل لا يُحفظ ولا يُرفع إلى خدمة جديدة. تُحفظ الصورة المقصوصة مع بيانات السيرة في IndexedDB بالطريقة الحالية؛ لا حساب سحابياً جديداً ولا عودة لتنزيل JSON.
حدود الأبعاد: 64×64 كحد أدنى، حتى 40MP و12,000px لكل ضلع. المساحات الشفافة تتحول إلى خلفية بيضاء. الصورة المتحركة ليست صيغة إخراج متحركة؛ الناتج JPEG ثابت.
حقل photoUrl القديم يبقى متوافقاً، لكن الواجهة وPDF لا يجلبان صوراً من روابط خارجية أو SVG. إذا احتوت بيانات قديمة رابطاً غير مدعوم، تبقى البيانات ويُطلب اختيار صورة محلية بديلة؛ لا يُعرض الرابط تلقائياً ولا يُمسح بقية CV.
مسح بيانات المتصفح قد يزيل السير والصور. افتح بنفس المتصفح وعنوان التشغيل/المنفذ السابق. الصورة قد تزيد ارتفاع الرأس وتغير فواصل الصفحات؛ المعاينة تعتمد PDF الحقيقي.

## التثبيت — كود واحد
أوقف خادم التطوير بـ Ctrl+C، وضع CV-Builder-Personal-Photo-Batch-11.zip داخل E:\cv tailor - Copy دون فكّه يدوياً، ثم الصق:

```powershell
$ErrorActionPreference = "Stop"
$project = "E:\cv tailor - Copy"
$zip = Join-Path $project "CV-Builder-Personal-Photo-Batch-11.zip"
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "ZIP not found in the project folder." }
Set-Location -LiteralPath $project
$folder = Join-Path $project ("_cv-photo-batch11-" + [guid]::NewGuid().ToString("N"))
Expand-Archive -LiteralPath $zip -DestinationPath $folder
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder "Apply-UI.ps1") -ProjectPath $project
if ($LASTEXITCODE -ne 0) { throw "Update stopped. Send the error; do not overwrite files manually." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Send the error." }
npm run dev
```

المتوقع Applied 8 files successfully، أو رسالة أن التحديث مطبق مسبقاً. لا يلزم npm install. المثبت يفحص البصمات قبل الكتابة ويحفظ ملفات المصدر الأصلية داخل .cv-builder-backups. عند اختلاف الملفات توقف وأرسل الخطأ؛ لا تفرض النسخ اليدوي. النسخ الاحتياطية هنا للمصدر، وليست بيانات مستخدم محفوظة في المتصفح.

## التراجع
المثبت يعرض مسار مجلد النسخة الاحتياطية. استخدم السكربت الموجود داخله مع **-BackupPath** لمسار ذلك المجلد:
```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<backup-folder>\Rollback-UI.ps1" -BackupPath "<backup-folder>"
```
لا تنفذ المثال قبل استبدال <backup-folder> بالمسار الفعلي. يفحص عدم وجود تعديلات أحدث قبل الاستعادة. التراجع عن المصدر لا يحذف بيانات الصورة المخزنة، لكنه يعيد واجهة Batch 10 التي لا تعرضها.

## حدود لم تتغير
لا تغيير لدعم تصدير العربية والخطوط، ولا إضافة تواريخ منظمة أو مستويات لغات أو CV Tailor. اختيار الصورة لا يجعلها مطلوبة للتقديم؛ يُنصح بإضافتها فقط حين تناسب جهة التوظيف.
صور الأشخاص في previews تجريبية فقط، لا تُضاف تلقائياً إلى مشروع المستخدم أو السير الجديدة.
