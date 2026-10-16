# تحديث UX رقم 05 — كتابة أسرع وأقسام مناسبة للمحتوى

هذا تحديث داخل مشروعك الحالي E:\cv tailor - Copy، وليس مشروعاً مستقلاً.
يتطلب تثبيت Batch 04 أولاً. لا تتجاوز فحص الملفات إذا توقف المثبّت.

## ما تغيّر
- مسار العنصر: إضافة ← كتابة ← Done ← ملخص مع Edit. يفتح عنصر واحد للتحرير داخل السكشن في كل مرة، ويظل الحفظ التلقائي يعمل أثناء الكتابة (Done ليس شرطاً للحفظ).
- أدوات نقل/حذف العنصر تظهر داخل نموذج التحرير بدل مزاحمة العناصر المطوية. الحذف يحتاج تأكيداً.
- خيار Show بجانب الحقل نفسه للعنوان الوظيفي والهاتف والموقع والروابط. إخفاء الحقل من السيرة لا يمسح النص المخزّن.
- الروابط المعبأة تظهر مباشرة، والحقول غير المستخدمة تُضاف بأزرار LinkedIn / Website / GitHub / Name suffix / Other link.
- Courses / Internships / Volunteering تنشئ أقساماً من نوع Experience: عنوان، جهة، موقع، تواريخ، وصف وعناصر متعددة.
- Achievements تنشئ قائمة نقاط: عنصر في كل سطر.
- Languages تنشئ عناصر قصيرة: فاصلة أو Enter للإضافة، ويمكن كتابة المستوى بين قوسين.
- References تنشئ قسماً نصياً.
- Custom section يعرض أربعة أنواع: Text، Experience، Bullet list، Skills & languages. تختار النوع قبل كتابة المحتوى، ولا توجد عملية تحويل تلقائي قد تفقد البيانات.
- القسم النصي يستخدم مساحة كتابة واحدة، مع سطر فارغ للفصل بين الفقرات؛ بدلاً من بطاقة مستقلة وأزرار لكل فقرة.
- الأقسام القديمة تبقى نصية وبمحتواها وترتيبها السابق؛ لا نحاول تخمين نوعها أو تحويلها. الأنواع الجديدة متاحة عند إنشاء قسم جديد.
- المعاينة وPDF يستخدمان نموذج العرض نفسه ويعرضان الأنواع الجديدة بحسب ترتيب الأقسام.
- يبقى المحرّر عمودين بلا قوائم تنقل مكررة. دعم أفضل للشاشات الصغيرة جداً (عمود حقول واحد حتى عرض 360px).

## التثبيت — أمر واحد يفك ويطبق ويشغّل
1. من التطبيق نزّل Download JSON backup من قائمة ⋯ واحتفظ به.
2. أوقف خادم التطوير بـ Ctrl+C.
3. ضع CV-Builder-UX-Batch-05.zip داخل E:\cv tailor - Copy. لا تفكّه ولا تنسخ ملفاته يدوياً.
4. الصق هذا الكود كاملاً في PowerShell:

```powershell
$ErrorActionPreference = "Stop"
$project = "E:\cv tailor - Copy"
$zip = Join-Path $project "CV-Builder-UX-Batch-05.zip"
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "ZIP not found in the project folder." }
Set-Location -LiteralPath $project
$folder = Join-Path $project ("_cv-ux-batch05-" + [guid]::NewGuid().ToString("N"))
Expand-Archive -LiteralPath $zip -DestinationPath $folder
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder "Apply-UI.ps1") -ProjectPath $project
if ($LASTEXITCODE -ne 0) { throw "Update stopped. Send the error; do not overwrite files manually." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Send the error." }
npm run dev
```

النتيجة المتوقعة: Applied 7 files successfully (أو أقل إذا كانت بعض الملفات مطبّقة سابقاً).
إذا ظهر Local changes detected أو اختلاف package.json، توقف وأرسل رسالة الخطأ، ولا تستخدم استبدالاً إجبارياً.
لا يلزم npm install ولا تغيير التبعيات لهذا التحديث.

## الحماية والتوافق
- ستة ملفات مصدر معدّلة وملف جديد EditorControls.tsx، دون تغيير package.json أو package-lock.json أو .env أو خدمات AI أو بيانات التحقق.
- امتداد اختياري لشكل customSections (kind وentries). ملفات JSON السابقة ما زالت قابلة للاستيراد، وغياب kind يعني قسماً نصياً قديماً.
- فحص كل الملفات والبصمات قبل كتابة أي ملف، ثم نسخة احتياطية داخل .cv-builder-backups. يطبع المثبّت مسار النسخة.
- السكربت لا يحذف بيانات المتصفح. استخدم نفس المتصفح وعنوان التشغيل القديم للوصول إلى السير المحلية. لا تمسح بيانات الموقع.
- للتراجع عن ملفات المصدر، استخدم Rollback-UI.ps1 الموجود داخل مجلد النسخة الاحتياطية مع -BackupPath لمسار ذلك المجلد. يتوقف إذا كانت ملفاتك قد تغيرت بعد التحديث.
- احتفظ بنسخة JSON الجديدة إذا أضفت أنواع أقسام جديدة. الإصدارات الأقدم لا تدعم هذه الأنواع؛ لا تستورد JSON الجديد فيها. التراجع عن المصدر لا يحوّل بيانات السير إلى الإصدار القديم.

## خارج نطاق هذه الدفعة
AI Tailor، تسجيل حسابات، رفع PDF/LinkedIn، محرّر نص غني، انتقاء الشهر/السنة، التراجع/الإعادة الشامل، ودعم العربية في PDF ليست منفّذة هنا. التواريخ تبقى نصية والنصوص تُصدّر بصيغة نصية آمنة. لا توجد أزرار AI شكلية أو اتصالات AI جديدة.
تحذيرا حجم حزمة PDF وvm-browserify eval السابقان ما زالا موجودين؛ البناء ينجح.
