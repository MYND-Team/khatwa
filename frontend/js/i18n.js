/**
 * Khatwa Platform — Full-Site i18n Translation Engine (Arabic RTL ⇄ English LTR)
 * High-performance, deep DOM text translation across ALL pages and components.
 */

(function (window) {
  // Master Bilingual Dictionary (Arabic ⇄ English)
  const DICTIONARY = {
    // ─── Branding & Platform ───
    "خطوة": "Khatwa",
    "منصة خطوة": "Khatwa Platform",
    "منصة تعليمية أونلاين": "Online Educational Platform",
    "منصة تعليمية": "Educational Platform",
    "الرئيسية": "Home",
    "تصفح الكورسات": "Browse Courses",
    "الكورسات": "Courses",
    "الكورسات والمواد": "Courses & Subjects",
    "كورساتي": "My Courses",
    "لوحة التحكم": "Dashboard",
    "لوحة الطالب": "Student Dashboard",
    "لوحتي التعليمية": "My Dashboard",
    "لوحة الإدارة": "Admin Panel",
    "لوحة تحكم وإدارة المنصة": "Platform Management Dashboard",
    "لوحة التحكم والإدارة العامة": "Platform Administration Dashboard",
    "استوديو المعلم": "Teacher Studio",
    "استوديو المدرس": "Teacher Studio",
    "لوحة المعلم": "Teacher Dashboard",
    "استوديو إدارة المعلم": "Teacher Management Studio",
    "النقاط": "Points",
    "النقاط والمحفظة": "Points & Wallet",
    "رصيد النقاط": "Points Balance",
    "رصيد المحفظة": "Wallet Balance",
    "المحفظة": "Wallet",
    "المحفظة والتحويلات": "Wallet & Transfers",
    "الإشعارات": "Notifications",
    "النتائج": "Results",
    "نتائجي": "My Results",
    "بياناتي": "My Profile",
    "الملف الشخصي": "Profile",
    "الأسئلة الشائعة": "FAQ",
    "مركز المساعدة": "Help Center",
    "تسجيل الدخول": "Login",
    "دخول": "Login",
    "إنشاء حساب": "Sign Up",
    "إنشاء حساب جديد": "Create New Account",
    "إنشاء حساب طالب": "Create Student Account",
    "تسجيل الخروج": "Logout",
    "القائمة": "Menu",
    "إغلاق": "Close",
    "إلغاء": "Cancel",
    "حفظ": "Save",
    "تعديل": "Edit",
    "حذف": "Delete",
    "تأكيد": "Confirm",
    "رجوع": "Back",
    "التالي": "Next",
    "السابق": "Previous",
    "بحث": "Search",
    "تصفية": "Filter",
    "عرض الكل": "View All",
    "المزيد": "More",
    "تفاصيل": "Details",
    "تحميل": "Download",
    "معاينة": "Preview",
    "إرسال": "Submit",
    "موافق": "OK",
    "نعم": "Yes",
    "لا": "No",
    "الكل": "All",

    // ─── Landing Page (index.html) ───
    "خطوة هي المكان اللي بيتابع فيه الطالب حصصه، يمتحن، ويسلّم واجباته من غير ما يتحرك من مكانه.": "Khatwa is where students follow lectures, take exams, and submit assignments seamlessly from home.",
    "النظام مبني على متابعة حقيقية: امتحان قبل كل حصة، واجب بنفس أسلوب الامتحان الإلكتروني، ولا تُفتح حصة جديدة إلا بعد إنهاء اللي قبلها. وولي الأمر يعرف النتيجة أول بأول.": "Built on genuine progress tracking: pre-lecture exam, interactive assignments, linear course progression, with instant parent report notifications.",
    "أونلاين بالكامل": "100% Online",
    "من أي جهاز ومكان": "From any device, anywhere",
    "نظام نقاط": "Points System",
    "شراء الحصص بعملة داخلية": "Purchase courses with internal points",
    "امتحان قبل كل حصة": "Exam Before Each Lecture",
    "لا تفتح الحصة إلا بعد اجتيازه": "Lecture unlocks only after passing",
    "واجب إلكتروني": "Interactive Homework",
    "تصحيح فوري بعد كل حصة": "Instant grading after every lecture",
    "رسائل لولي الأمر": "Parent SMS Alerts",
    "الدرجة بتوصل في نفس اللحظة": "Grades sent instantly to parents",
    "ليه تختار منصة خطوة؟": "Why Choose Khatwa Platform?",
    "صُممت المنصة لتمنح الطالب تجربة تعليمية متكاملة تضمن الالتزام والتفوق": "Designed to provide a complete learning experience guaranteeing discipline and excellence",
    "نخبة من أفضل المدرسين": "Top Elite Educators",
    "شروحات احترافية ومحتوى محدث باستمرار لأفضل المعلمين المتخصصين.": "Professional explanations and constantly updated content from specialized top teachers.",
    "نظام تقييم ومتابعة صارم": "Rigorous Evaluation System",
    "لا يمكن تخطي أي محاضرة دون حل الواجب واجتياز الاختبار الخاص بها.": "No skipping lectures without completing homework and passing the required exam.",
    "تجربة مستخدم سريعة وسلسة": "Fast & Smooth Experience",
    "واجهة حديثة وسريعة تعمل بكفاءة على جميع شاشات الهواتف والحواسيب.": "Ultra-fast modern UI operating smoothly across all phone, tablet, and PC screens.",
    "كيف تعمل المنصة": "How Khatwa Works",
    "3 خطوات تفصلك عن التفوق الأكاديمي": "3 Simple Steps to Academic Excellence",
    "1. اختر المدرس والكورس": "1. Choose Teacher & Course",
    "استكشف مكتبة الكورسات والمحاضرات واختر المادة والمدرس المناسب لمرحلتك الدراسية.": "Explore the course library and select the right subject and teacher for your academic grade.",
    "2. اشحن رصيد النقاط": "2. Recharge Points",
    "اشحن محفظتك بالنقاط بسهولة عبر طرق الدفع المتاحة لفتح الكورسات والمحاضرات.": "Easily top up your wallet points via available payment methods to unlock courses and lessons.",
    "3. شاهد، امتحن، وتفوق": "3. Watch, Exam & Excel",
    "شاهد الفيديوهات بجودة عالية، حمّل المذكرات، وسلّم واجباتك أولاً بأول.": "Watch high-definition videos, download study notes, and submit your homework continuously.",
    "أحدث الكورسات المتاحة": "Latest Available Courses",
    "استكشف أحدث الحصص والمراجعات الشاملة لجميع المراحل الثانوية والإعدادية": "Explore the newest lectures and comprehensive revisions for all secondary and prep stages",
    "تصفح الكورس": "View Course",
    "كورس تعليمي شامل لإتقان المادة.": "Comprehensive educational course for subject mastery.",
    "محاضرات": "Lectures",
    "محاضرة": "Lecture",
    "نقطة": "Points",
    "ج.م": "EGP",
    "مجاني": "Free",
    "اشترك الآن": "Enroll Now",
    "مشترك بالفعل": "Enrolled",
    "ابدأ رحلتك التعليمية الآن مع خطوة": "Start Your Learning Journey Now with Khatwa",
    "انضم لآلاف الطلاب وابدأ بمتابعة حصصك وامتحاناتك بكل سهولة.": "Join thousands of students and start tracking your classes and exams easily.",
    "إنشاء حساب الآن": "Create Account Now",
    "© 2026 خطوة — جميع الحقوق محفوظة": "© 2026 Khatwa — All Rights Reserved",

    // ─── Academic Stages ───
    "المرحلة الإعدادية": "Preparatory Stage",
    "الصف الأول الثانوي": "Secondary Year 1",
    "الصف الثاني الثانوي": "Secondary Year 2",
    "الصف الثالث الثانوي": "Secondary Year 3",
    "أولى ثانوي": "Secondary 1",
    "تانية ثانوي": "Secondary 2",
    "تالتة ثانوي": "Secondary 3",
    "جميع المراحل الدراسية": "All Academic Stages",
    "جميع المراحل": "All Stages",
    "المراحل الدراسية": "Academic Stages",
    "المراحل الدراسية المعتمدة": "Accredited Academic Stages",

    // ─── Subjects ───
    "الفيزياء": "Physics",
    "الكيمياء": "Chemistry",
    "الأحياء": "Biology",
    "الرياضيات": "Mathematics",
    "اللغة العربية": "Arabic Language",
    "اللغة الإنجليزية": "English Language",
    "اللغة الفرنسية": "French Language",
    "اللغة الألمانية": "German Language",
    "التاريخ": "History",
    "الجغرافيا": "Geography",
    "الفلسفة والمنطق": "Philosophy & Logic",
    "علم النفس والاجتماع": "Psychology & Sociology",
    "الجيولوجيا": "Geology",
    "عام": "General",

    // ─── Roles ───
    "طالب": "Student",
    "طالب معتمد": "Accredited Student",
    "مدرس": "Teacher",
    "مدرس معتمد": "Accredited Teacher",
    "معلم": "Teacher",
    "المدرس": "Teacher",
    "المعلم": "Teacher",
    "مدير عام المنصة": "Platform Director",
    "مدير": "Admin",
    "مشرف": "Supervisor",
    "مشرف متابعة (Staff)": "Follow-up Supervisor (Staff)",
    "فريق المتابعة": "Support Staff",
    "المسؤول": "Administrator",
    "الإدارة": "Management",

    // ─── Auth (Login / Signup) ───
    "ادخل بيانات حسابك لمتابعة حصصك أو إدارة كورساتك": "Enter your account details to resume lectures or manage courses",
    "اسم المستخدم": "Username",
    "اسم المستخدم للدخول (Username)": "Login Username",
    "كلمة المرور": "Password",
    "كلمة المرور المؤقتة": "Temporary Password",
    "تأكيد كلمة المرور": "Confirm Password",
    "تذكرني": "Remember Me",
    "نسيت كلمة المرور؟": "Forgot Password?",
    "ليس لديك حساب؟": "Don't have an account?",
    "أنشئ حسابًا جديدًا": "Create a new account",
    "لديك حساب بالفعل؟": "Already have an account?",
    "إظهار": "Show",
    "إخفاء": "Hide",
    "جارٍ التحقق...": "Verifying...",
    "اسم المستخدم أو كلمة المرور غير صحيحة.": "Invalid username or password.",
    "التسجيل على المنصة متاح للطلاب فقط. إذا كنت مدرساً، تواصل مع الإدارة لإنشاء حسابك.": "Registration is available for students only. Teachers should contact platform administration.",
    "بيانات الطالب": "Student Information",
    "رقم هاتف الطالب": "Student Phone Number",
    "الصف الدراسي": "Academic Year",
    "بيانات ولي الأمر": "Parent Information",
    "رقم هاتف ولي الأمر (لإرسال النتائج)": "Parent Phone Number (for result SMS)",
    "رقم هاتف ولي الأمر": "Parent Phone Number",
    "وظيفة الأب": "Father's Profession",
    "البريد الإلكتروني لولي الأمر (اختياري)": "Parent Email (Optional)",
    "حالة الوالدين": "Parental Status",
    "الوالدان على قيد الحياة": "Both Parents Alive",
    "الأب متوفى": "Father Deceased",
    "الأم متوفاة": "Mother Deceased",
    "كلا الوالدين متوفيان": "Both Parents Deceased",
    "إنشاء الحساب وبدء التعلم": "Create Account & Start Learning",

    // ─── Courses & Discovery (courses.html, subject.html) ───
    "المكتبة الأكاديمية": "Academic Library",
    "تصفح جميع الكورسات والمحاضرات": "Browse All Courses & Lectures",
    "ابحث عن كورس، مادة، أو اسم المدرس...": "Search courses, subjects, or teacher names...",
    "بحث باسم الكورس أو المدرس...": "Search by course or teacher...",
    "المرحلة:": "Stage:",
    "المادة:": "Subject:",
    "الترتيب:": "Sort By:",
    "الأحدث": "Newest",
    "الأعلى تقييماً": "Top Rated",
    "الأقل سعراً": "Lowest Price",
    "الأعلى سعراً": "Highest Price",
    "السعر:": "Price:",
    "سعر الكورس": "Course Price",
    "اشترك في الكورس": "Enroll in Course",
    "محتوى الكورس": "Course Content",
    "الفصول والمحاضرات": "Chapters & Lectures",
    "الفصل": "Chapter",
    "محاضرات الكورس": "Course Lectures",
    "لا توجد كورسات متاحة حالياً تطابق بحثك": "No courses found matching your criteria",
    "نخبة مدرسي المنصة": "Featured Platform Teachers",
    "تصفح نخبة من أفضل المعلمين والمحاضرين المتخصصين": "Learn with top specialized teachers and lecturers",

    // ─── Lesson & Progression (lesson.html) ───
    "المحاضرة": "Lecture",
    "فيديو المحاضرة": "Lecture Video",
    "مذكرة الدرس (PDF)": "Lesson Notes (PDF)",
    "الواجب والاختبار": "Homework & Exam",
    "الخطوة 1: حل الواجب": "Step 1: Complete Homework",
    "الخطوة 2: اجتياز الاختبار": "Step 2: Pass Exam",
    "الخطوة 3: مشاهدة المحاضرة والمحتوى": "Step 3: Access Lecture & Content",
    "يجب تسليم الواجب أولاً لفتح الاختبار والمحاضرة.": "You must submit homework first to unlock the exam and lecture.",
    "يجب اجتياز هذا الاختبار أولاً لفتح المحاضرة والملفات.": "You must pass this exam first to unlock lecture videos and materials.",
    "تم فتح المحاضرة بنجاح!": "Lecture unlocked successfully!",
    "تحميل مذكرة الدرس (PDF)": "Download Lesson PDF",
    "معاينة الملف داخل المنصة": "View PDF in Platform",
    "بدء حل الواجب": "Start Homework",
    "بدء الامتحان": "Start Exam",
    "إعادة المحاولة": "Try Again",
    "تم تسليم الواجب": "Homework Submitted",
    "تم اجتياز الاختبار بنجاح": "Exam Passed Successfully",
    "الدرجة:": "Score:",
    "نسبة النجاح:": "Passing Rate:",
    "وقت المشاهدة": "Watch Time",
    "ملاحظات المحاضرة": "Lecture Notes",
    "شارك سؤالك أو تعليقك حول المحاضرة...": "Post a question or comment about this lecture...",
    "إرسال التعليق": "Post Comment",

    // ─── Exam & Homework (exam.html, homework.html, results.html) ───
    "الامتحان الإلكتروني": "Online Exam",
    "الواجب الإلكتروني": "Online Homework",
    "الامتحان الإلكتروني للمحاضرة": "Lecture Online Exam",
    "الواجب الإلكتروني للمحاضرة": "Lecture Online Homework",
    "حل أسئلة الواجب والتدريبات لتثبيت المفاهيم وتقييم فهمك للدرس.": "Answer homework questions to reinforce concepts and assess understanding.",
    "أجب عن جميع الأسئلة ثم اضغط تسليم النتيجة.": "Answer all questions then submit your results.",
    "سؤال": "Question",
    "من": "of",
    "الدرجة الكلية": "Total Score",
    "تسليم الامتحان": "Submit Exam",
    "تسليم الواجب": "Submit Homework",
    "مبروك، اجتزت الامتحان بنجاح!": "Congratulations, you passed the exam!",
    "تم تسليم الامتحان": "Exam Submitted",
    "تم اجتياز الواجب بنجاح!": "Homework Passed Successfully!",
    "سجل الاختبارات والواجبات": "Exams & Homework History",
    "نظرة عامة على درجاتك في جميع الامتحانات والواجبات": "Overview of your grades across all exams and assignments",
    "اسم الاختبار": "Quiz Title",
    "التاريخ": "Date",
    "الدرجة": "Score",
    "الحالة": "Status",
    "اجتياز بنجاح": "Passed",
    "يحتاج إعادة": "Needs Retake",
    "لا توجد نتائج مسجلة حتى الآن": "No recorded results yet",

    // ─── Dashboard & Profile (dashboard.html, profile.html, points.html) ───
    "نظرة عامة": "Overview",
    "مرحباً بك مجدداً،": "Welcome back,",
    "استكمل رحلتك التعليمية وتابع حصصك أولاً بأول": "Continue your learning journey and keep up with lectures",
    "الكورسات المشترك بها": "Enrolled Courses",
    "ساعات المشاهدة": "Watch Hours",
    "الامتحانات المكتملة": "Completed Exams",
    "النقاط المتاحة": "Available Points",
    "متابعة المشاهدة": "Resume Watching",
    "استكمال الكورس": "Continue Course",
    "آخر الأنشطة والامتحانات": "Recent Activities & Exams",
    "شحن رصيد النقاط": "Recharge Points",
    "شحن المحفظة": "Recharge Wallet",
    "شحن رصيد": "Recharge Balance",
    "سجل المعاملات": "Transaction History",
    "تعديل البيانات": "Edit Profile",
    "تحديث البيانات": "Update Profile",
    "تغيير كلمة المرور": "Change Password",
    "كلمة المرور الحالية": "Current Password",
    "كلمة المرور الجديدة": "New Password",
    "تأكيد كلمة المرور الجديدة": "Confirm New Password",
    "حفظ التعديلات": "Save Changes",

    // ─── Teacher Studio (teacher-dashboard.html) ───
    "إدارة الكورسات، الفصول، المحاضرات، وبنك الأسئلة": "Manage courses, chapters, lectures, and question banks",
    "إضافة كورس جديد": "Add New Course",
    "إنشاء كورس": "Create Course",
    "عنوان الكورس": "Course Title",
    "وصف الكورس": "Course Description",
    "صورة الكورس (URL)": "Course Image URL",
    "سعر الكورس بالنقاط": "Course Price (Points)",
    "سعر الكورس بالجنيه": "Course Price (EGP)",
    "إضافة فصل": "Add Chapter",
    "إضافة محاضرة": "Add Lecture",
    "عنوان المحاضرة": "Lecture Title",
    "رابط فيديو Google Drive / YouTube": "Video Link (Google Drive / YouTube)",
    "رابط مذكرة الدرس (PDF)": "Lesson Notes Link (PDF)",
    "بنك الأسئلة والاختبارات": "Question Bank & Quizzes",
    "إضافة سؤال اختيار من متعدد": "Add Multiple Choice Question",
    "إضافة سؤال مقالي": "Add Essay Question",
    "إضافة سؤال معادلة رياضية": "Add Equation Question",
    "نص السؤال": "Question Text",
    "الخيارات": "Options",
    "الإجابة الصحيحة": "Correct Answer",
    "نشر": "Publish",
    "إلغاء النشر": "Unpublish",
    "منشور": "Published",
    "مسودة": "Draft",
    "إجمالي الطلاب": "Total Students",
    "إجمالي المشاهدات": "Total Views",
    "متوسط التقييم": "Average Rating",
    "تصفح كطالب": "Browse as Student",

    // ─── Admin Panel (admin.html, admin-points.html) ───
    "إجمالي الطلاب": "Total Students",
    "إجمالي المدرسين": "Total Teachers",
    "إجمالي الكورسات": "Total Courses",
    "طلبات شحن معلقة": "Pending Recharge Requests",
    "طلبات شحن معلقة حالياً": "Pending Recharge Requests",
    "قاعدة البيانات المباشرة 🛡️": "Live Database 🛡️",
    "متابعة فورية وشاملة لجميع الطلاب، المدرسين، الكورسات، طلبات الشحن، والمحفظة المالية.": "Real-time monitoring of all students, teachers, courses, recharge requests, and platform finances.",
    "إدارة المدرسين": "Teachers Directory",
    "إدارة الطلاب": "Students Directory",
    "مراجعة طلبات الشحن": "Review Recharge Requests",
    "مراجعة وشحن طلبات النقاط (Staff / Admin)": "Review & Process Recharge Requests (Staff / Admin)",
    "سجلات الأمان والنظام": "Security & System Logs",
    "إضافة مدرس جديد": "Add New Teacher",
    "👨‍🏫 إضافة مدرس جديد": "👨‍🏫 Add New Teacher",
    "إنشاء حساب مدرس جديد": "Create New Teacher Account",
    "👨‍🏫 إنشاء حساب مدرس جديد": "👨‍🏫 Create New Teacher Account",
    "اعتماد المدرس في الكادر الأكاديمي للمنصة": "Accredit teacher into platform academic staff",
    "أدخل بيانات المدرس لإنشاء حسابه واعتماده في الكادر الأكاديمي للمنصة.": "Enter teacher credentials to create and accredit their account.",
    "الاسم المعروض (اللقب الكامل)": "Display Name (Full Title)",
    "المادة التخصصية": "Specialized Subject",
    "رابط صورة المدرس (Avatar URL)": "Teacher Avatar URL",
    "نبذة وسيرة ذاتية (Bio)": "Bio / Resume",
    "إنشاء وحفظ المدرس": "Create & Save Teacher",
    "إنشاء وحفظ المدرس ✓": "Create & Save Teacher ✓",
    "الكادر الأكاديمي": "Academic Staff",
    "إيصالات بانتظار الاعتماد": "Receipts Awaiting Approval",
    "بحث باسم الطالب أو رقم الهاتف...": "Search student name or phone...",
    "بحث باسم المدرس أو المادة...": "Search teacher name or subject...",
    "تحويل رصيد مالي (EGP)": "Transfer Funds (EGP)",
    "تعديل رصيد النقاط": "Adjust Points Balance",
    "ملف الطالب": "Student Dossier",
    "ملاحظات الطالب": "Student Notes",
    "إضافة ملاحظة": "Add Note",
    "موافقة": "Approve",
    "موافقة ✓": "Approve ✓",
    "رفض": "Reject",
    "رفض ✕": "Reject ✕",
    "نشط": "Active",
    "معطل": "Disabled",
    "تفعيل": "Enable",
    "تعطيل": "Disable",
    "سجلات تشغيل وحماية الفيديوهات": "Video Playback & Security Logs",
    "عنوان IP": "IP Address",
    "الوقت": "Timestamp",
    "الطالب": "Student",
    "المبلغ": "Amount",
    "الكود": "Code",
    "الإيصال": "Receipt",
    "ملاحظات": "Notes",
    "الإجراء": "Action",

    // ─── Notifications & Status ───
    "نشط ✓": "Active ✓",
    "معطل ✕": "Disabled ✕",
    "مكتمل": "Completed",
    "معلق": "Pending",
    "مرفوض": "Rejected",
    "مقبول": "Approved",
    "تمت العملية بنجاح": "Operation Successful",
    "حدث خطأ، يرجى المحاولة مرة أخرى": "An error occurred, please try again",
    "لا توجد بيانات متاحة حالياً": "No data available currently",
    "لا يوجد مدرسون مضافون بعد": "No teachers added yet",
    "جارٍ التحميل...": "Loading...",
    "جارٍ الحفظ في قاعدة البيانات...": "Saving to database...",
    "تم إنشاء حساب المدرس بنجاح": "Teacher account created successfully"
  };

  // Reverse mapping (English -> Arabic)
  const REVERSE_DICT = {};
  for (const [ar, en] of Object.entries(DICTIONARY)) {
    REVERSE_DICT[en] = ar;
  }

  // Pre-sort dictionary phrases by length descending to match longest phrases first
  const AR_PHRASES = Object.keys(DICTIONARY).sort((a, b) => b.length - a.length);
  const EN_PHRASES = Object.keys(REVERSE_DICT).sort((a, b) => b.length - a.length);

  // WeakMaps for storing original values without polluting DOM
  const textNodeMap = new WeakMap();
  const inputPlaceholderMap = new WeakMap();
  const inputTitleMap = new WeakMap();

  function getLanguage() {
    return localStorage.getItem('khatwa_lang') || 'ar';
  }

  function setLanguage(lang) {
    if (lang !== 'ar' && lang !== 'en') lang = 'ar';
    localStorage.setItem('khatwa_lang', lang);
    applyLanguage(lang);
  }

  function toggleLanguage() {
    const nextLang = getLanguage() === 'ar' ? 'en' : 'ar';
    setLanguage(nextLang);
  }

  /**
   * Translate a single text string
   */
  function translateString(str, lang) {
    if (!str || typeof str !== 'string') return str;
    const trimmed = str.trim();
    if (!trimmed) return str;

    if (lang === 'en') {
      // 1. Exact match
      if (DICTIONARY[trimmed]) {
        return str.replace(trimmed, DICTIONARY[trimmed]);
      }
      // 2. Phrase matching (longest first)
      let result = str;
      for (const arPhrase of AR_PHRASES) {
        if (result.includes(arPhrase)) {
          result = result.split(arPhrase).join(DICTIONARY[arPhrase]);
        }
      }
      return result;
    } else {
      // Revert to Arabic
      if (REVERSE_DICT[trimmed]) {
        return str.replace(trimmed, REVERSE_DICT[trimmed]);
      }
      let result = str;
      for (const enPhrase of EN_PHRASES) {
        if (result.includes(enPhrase)) {
          result = result.split(enPhrase).join(REVERSE_DICT[enPhrase]);
        }
      }
      return result;
    }
  }

  /**
   * Translates all text nodes and attributes within a DOM subtree
   */
  function translateTree(rootNode, lang) {
    if (!rootNode) return;

    // 1. Process inputs & textareas (placeholders)
    const inputs = rootNode.querySelectorAll ? rootNode.querySelectorAll('input, textarea') : [];
    inputs.forEach(inp => {
      if (inp.placeholder) {
        if (!inputPlaceholderMap.has(inp)) {
          inputPlaceholderMap.set(inp, inp.placeholder);
        }
        const orig = inputPlaceholderMap.get(inp);
        inp.placeholder = lang === 'en' ? translateString(orig, 'en') : orig;
      }
      if (inp.title) {
        if (!inputTitleMap.has(inp)) {
          inputTitleMap.set(inp, inp.title);
        }
        const orig = inputTitleMap.get(inp);
        inp.title = lang === 'en' ? translateString(orig, 'en') : orig;
      }
    });

    // 2. Walk all text nodes using TreeWalker
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'code', 'pre', 'svg', 'noscript'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    let currentNode;
    while ((currentNode = walker.nextNode())) {
      if (!textNodeMap.has(currentNode)) {
        textNodeMap.set(currentNode, currentNode.nodeValue);
      }
      const origValue = textNodeMap.get(currentNode);
      if (lang === 'en') {
        currentNode.nodeValue = translateString(origValue, 'en');
      } else {
        currentNode.nodeValue = origValue;
      }
    }
  }

  function applyLanguage(lang) {
    if (!lang) lang = getLanguage();

    // 1. Set HTML direction & lang attribute
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    // 2. Translate entire document body
    if (document.body) {
      translateTree(document.body, lang);
    }

    // 3. Update all language switcher buttons
    document.querySelectorAll('.lang-switcher-btn').forEach(btn => {
      btn.innerHTML = lang === 'ar' ? '🌐 English' : '🌐 العربية';
    });
  }

  // 4. MutationObserver for dynamic API content
  let observer = null;
  function initObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(mutations => {
      const currentLang = getLanguage();
      if (currentLang === 'en') {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              translateTree(node, 'en');
            } else if (node.nodeType === Node.TEXT_NODE) {
              if (!textNodeMap.has(node)) textNodeMap.set(node, node.nodeValue);
              node.nodeValue = translateString(textNodeMap.get(node), 'en');
            }
          });
        });
      }
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyLanguage(getLanguage());
      initObserver();
    });
  } else {
    applyLanguage(getLanguage());
    initObserver();
  }

  window.KhatwaI18n = {
    t: (key, fallback = '') => (getLanguage() === 'en' ? DICTIONARY[key] || fallback || key : key),
    getLanguage,
    setLanguage,
    toggleLanguage,
    applyLanguage,
    translateElement: (el) => translateTree(el, getLanguage()),
    DICTIONARY
  };
})(window);
