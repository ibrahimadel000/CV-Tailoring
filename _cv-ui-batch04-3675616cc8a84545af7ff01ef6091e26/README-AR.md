# تحديث 04 — محرّر واحد ومعاينة واحدة

هذا تحديث داخل مشروعك الحالي، وليس مشروعاً مستقلاً. يتطلب تثبيت Batch 03 أولاً.

## التصميم الجديد
- عمودان فقط: محرّر أقسام واحد يساراً ومعاينة يميناً.
- إزالة YOUR RESUME وSections/Content المتكررة وخيار Focused editor وتذييل الخطوات.
- اضغط اسم القسم لفتحه أو إغلاقه. يفتح قسم واحد في كل مرة.
- اسحب مقبض النقاط لتغيير ترتيب القسم. Personal details ثابت أولاً. Escape يلغي السحب، والأسهم وHome/End تعمل عند تركيز المقبض.
- Add section ينقلك مباشرة إلى الإضافات السريعة أسفل القائمة.
- حقول أوسع، مع إخفاء الروابط والخيارات الثانوية داخل Links & extra details وDisplay options.
- نماذج الخبرات الموجودة تبدأ مطوية، والعنصر الجديد يفتح تلقائياً.
- شريط أدوات واحد للمعاينة: Design، التكبير، Fit، PDF preview والتركيز على المعاينة.
- Design يفتح لوحة مؤقتة مكان المحرّر. على سطح المكتب تبقى المعاينة مرئية، وتُحدّث مباشرة. Done أو الإغلاق يعيد المحرّر كما كان.
- النسخ الاحتياطي والاستيراد داخل زر المزيد ⋯ في الأعلى.
- على الجوال: Edit resume / Live preview فقط للتبديل بين العمودين.

الإضافات الجاهزة تستخدم عناوين وفقرات قابلة للتعديل؛ لا تضيف نماذج متخصصة أو وظائف استيراد LinkedIn غير موجودة. AI Tailor ما زال مؤجلاً؛ لا توجد أزرار AI غير فعالة.

## التثبيت التلقائي
1. نزّل JSON backup من ⋯ احتياطياً (في النسخة القديمة قد يظهر Backup مباشرة).
2. أوقف التطبيق بـ Ctrl+C.
3. ضع CV-Builder-UI-Batch-04.zip داخل E:\cv tailor - Copy، ولا تفكه يدوياً.
4. الصق هذا الكود كاملاً في PowerShell:

```powershell
$ErrorActionPreference = "Stop"
$project = "E:\cv tailor - Copy"
$zip = Join-Path $project "CV-Builder-UI-Batch-04.zip"
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "ZIP file not found in the project folder." }
Set-Location -LiteralPath $project
$folder = Join-Path $project ("_cv-ui-batch04-" + [guid]::NewGuid().ToString("N"))
Expand-Archive -LiteralPath $zip -DestinationPath $folder
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder "Apply-UI.ps1") -ProjectPath $project
if ($LASTEXITCODE -ne 0) { throw "Update stopped. Send the error; do not overwrite files manually." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Send the error." }
npm run dev
```

نجاح التثبيت: Applied 5 files successfully (أو أقل إن كان بعضها مطبقاً).
إذا ظهرت Local changes detected، توقف وأرسل الخطأ. لا تتجاوز فحص البصمات.

## نطاق التغيير والنسخ الاحتياطي
- خمسة ملفات مصدر معدلة، دون تغيير package.json أو package-lock.json أو .env أو التبعيات أو شكل بيانات السير.
- بيانات المتصفح لا يحذفها المثبّت. أبقِ نفس المتصفح وعنوان التشغيل للوصول إلى سيرك المحفوظة.
- يُنشئ المثبّت نسخة من الملفات قبل تعديلها داخل .cv-builder-backups ويطبع مسارها.
- للتراجع استخدم Rollback-UI.ps1 مع -BackupPath لمجلد النسخة. إذا عدّلت ملفات بعد التثبيت يتوقف التراجع لحماية عملك.
- ملفات PDF ما زالت تستخدم خطوط النسخة السابقة؛ دعم العربية في PDF خارج نطاق هذا التحديث.
