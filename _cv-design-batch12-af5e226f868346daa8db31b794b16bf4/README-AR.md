# Batch 12 — تمرير المعاينة أثناء فتح Design

يتطلب تطبيق Batch 11 أولاً. تحديث ثلاثة ملفات فقط، ولا يغير البيانات أو الصور أو الحفظ أو التبعيات أو خدمة AI.

## الإصلاح
السبب السابق: استخدام dialog.showModal لواجهة التصميم كان يجعل المعاينة خلفها غير تفاعلية، رغم ظهورها على الجانب. أصبحت Design لوحة داخل مساحة العمل وليست نافذة حاجبة.
- الكمبيوتر: لوحة التصميم مكان محرر البيانات على اليسار، والمعاينة على اليمين متاحة للتمرير والزووم والتفاعل.
- الهاتف بوضعه العمودي: إعدادات التصميم أعلى والمعاينة أسفل؛ كل منطقة تمرر بشكل مستقل، بدون إغلاق التصميم لفحص الصفحة الثانية.
- الهاتف الأفقي والشاشات القصيرة المتوسطة: الإعدادات والمعاينة بجانب بعضهما لاستغلال الارتفاع.
- إعدادات التصميم لها تمرير داخلي، مع بقاء العنوان وزر Done ظاهرين.
- تغيير اللون لا يعيد المعاينة لأعلى. تغيير القالب يحتفظ بموضع التمرير العددي، لكن المحتوى نفسه قد يتحرك طبيعياً لأن فواصل الصفحات تتغير.
- النقر على عنوان قسم داخل PDF يرجع لتحرير ذلك القسم ويغلق Design عمداً. وضع Focus preview يغلق Design لتكبير المعاينة. فتح PDF preview أو Export ما زال نافذة حاجبة مقصودة؛ Escape يغلقها وحدها ثم يمكن الرجوع للتصميم.
- Done أو زر X أو Escape يغلق Design ويعيد التركيز إلى زر Design. Tab لا يُحبس داخل التصميم؛ يمكن الوصول للمعاينة وتمريرها بلوحة المفاتيح بعد التركيز عليها.
- في الجوال زر Edit resume يرجع للتحرير. النموذج الحالي لا يُحذف عند فتح Design، وتبقى بياناته وحالته المحلية.

## التثبيت
أوقف npm run dev بـ Ctrl+C، وضع ZIP داخل مجلد المشروع دون فكه يدوياً، ثم الصق:

```powershell
$ErrorActionPreference = "Stop"
$project = "E:\cv tailor - Copy"
$zip = Join-Path $project "CV-Builder-Design-Scroll-Batch-12.zip"
if (-not (Test-Path -LiteralPath $zip -PathType Leaf)) { throw "ZIP not found in the project folder." }
Set-Location -LiteralPath $project
$folder = Join-Path $project ("_cv-design-batch12-" + [guid]::NewGuid().ToString("N"))
Expand-Archive -LiteralPath $zip -DestinationPath $folder
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $folder "Apply-UI.ps1") -ProjectPath $project
if ($LASTEXITCODE -ne 0) { throw "Update stopped. Send the error; do not overwrite files manually." }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed. Send the error." }
npm run dev
```

المتوقع Applied 3 files successfully أو أن التحديث مطبق مسبقاً. لا npm install. المثبت يفحص بصمات الملفات قبل التعديل ويحفظ نسخة المصدر تحت .cv-builder-backups. إذا ظهر Local changes detected توقف وأرسل الخطأ؛ لا تستبدل الملفات يدوياً. هذه نسخة احتياطية للمصدر، وليست بيانات المتصفح.

## اختبار سريع بعد التشغيل
1. افتح سيرة من صفحتين أو أكثر، ثم Design.
2. غير اللون ومرّر المعاينة للوصول للصفحة الثانية دون إغلاق Design.
3. مرّر إعدادات Design نفسها؛ يجب ألا يتحرك موضع المعاينة معها.
4. جرب قالباً آخر، ثم Done وارجع لتحرير بياناتك.

## التراجع
استخدم مجلد النسخة الاحتياطية الذي يعرضه المثبت:
```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<backup-folder>\Rollback-UI.ps1" -BackupPath "<backup-folder>"
```
استبدل <backup-folder> بالمسار الفعلي. لا يمس التراجع بيانات المستخدم، ويوقف الاستعادة إذا اكتشف تعديلات أحدث على المصدر. استخدم نفس المتصفح والعنوان/المنفذ المعتاد للوصول لسيرك المحلية.
