/**
 * Khatwa Platform — Master i18n Translation Engine (Arabic RTL ⇄ English LTR)
 * High-performance, full-DOM recursive text & dynamic content translation across all pages.
 */

(function (window) {
  // Master Bilingual Dictionary
  const DICTIONARY = {
    // ─── Branding & Core Navigation ───
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
    "📊 لوحة الإدارة": "📊 Admin Panel",
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
    "رصيد المحفظة (EGP)": "Wallet Balance (EGP)",
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

    // ─── Admin Dashboard Stats & Headers ───
    "تحديث البيانات": "Refresh Data",
    "تحديث البيانات 🔄": "Refresh Data 🔄",
    "إجمالي الطلاب المسجلين": "Total Registered Students",
    "إجمالي الطلاب": "Total Students",
    "إجمالي المدرسين": "Total Teachers",
    "إجمالي الكورسات": "Total Courses",
    "إجمالي الكورسات والحصص": "Total Courses & Lessons",
    "طلبات شحن معلقة": "Pending Recharge Requests",
    "طلبات شحن معلقة حالياً": "Pending Recharge Requests",
    "إجمالي النقاط المشحونة": "Total Recharged Points",
    "إجمالي النقاط المعتمدة": "Total Approved Points",
    "حسابات بقاعدة البيانات": "Database Accounts",
    "الكادر الأكاديمي": "Academic Staff",
    "الكادر الأكاديمي والمدرسين المعتمدين": "Academic Staff & Verified Teachers",
    "محاضرات ومحتوى تعليمي": "Lectures & Educational Content",
    "إيصالات بانتظار الاعتماد": "Receipts Awaiting Approval",
    "قاعدة البيانات المباشرة 🛡️": "Live Database 🛡️",
    "متابعة فورية وشاملة لجميع الطلاب، المدرسين، الكورسات، طلبات الشحن، والمحفظة المالية.": "Real-time monitoring of all students, teachers, courses, recharge requests, and platform finances.",
    "إدارة ومتابعة الطلاب": "Students Directory & Tracking",
    "إدارة المدرسين": "Teachers Directory",
    "مراجعة طلبات الشحن": "Review Recharge Requests",
    "مراجعة وشحن طلبات النقاط (Staff / Admin)": "Review & Process Recharge Requests (Staff / Admin)",
    "مراجعة إيصالات وطلبات الشحن": "Review Receipts & Recharge Requests",
    "سجلات الأمان والنظام": "Security & System Logs",
    "إضافة مدرس جديد": "Add New Teacher",
    "👨‍🏫 إضافة مدرس جديد": "👨‍🏫 Add New Teacher",
    "＋ إنشاء حساب مدرس جديد": "＋ Create New Teacher Account",
    "إنشاء حساب مدرس جديد": "Create New Teacher Account",
    "👨‍🏫 إنشاء حساب مدرس جديد": "👨‍🏫 Create New Teacher Account",
    "اعتماد المدرس في الكادر الأكاديمي للمنصة": "Accredit teacher into platform academic staff",
    "أدخل بيانات المدرس لإنشاء حسابه واعتماده في الكادر الأكاديمي للمنصة.": "Enter teacher credentials to create and accredit their account.",
    "اسم المستخدم للدخول (Username)": "Login Username",
    "اسم المستخدم للدخول": "Login Username",
    "كلمة المرور المؤقتة": "Temporary Password",
    "الاسم المعروض (اللقب الكامل)": "Display Name (Full Title)",
    "الاسم المعروض": "Display Name",
    "المادة التخصصية": "Specialized Subject",
    "التخصص": "Subject",
    "رابط صورة المدرس (Avatar URL)": "Teacher Avatar URL",
    "المراحل الدراسية المعتمدة": "Accredited Academic Stages",
    "المراحل الدراسية": "Academic Stages",
    "نبذة وسيرة ذاتية (Bio)": "Bio / Resume",
    "إنشاء وحفظ المدرس": "Create & Save Teacher",
    "إنشاء وحفظ المدرس ✓": "Create & Save Teacher ✓",

    // ─── Admin Table Columns & Action Buttons ───
    "الطالب": "Student",
    "هاتف الطالب": "Student Phone",
    "هاتف ولي الأمر": "Parent Phone",
    "وظيفة الأب": "Father's Profession",
    "الحالة": "Status",
    "تاريخ التسجيل": "Registration Date",
    "الإجراءات": "Actions",
    "الإجراء": "Action",
    "الملف والعمليات": "Dossier & Operations",
    "📂 الملف والعمليات": "📂 Dossier & Operations",
    "المدرس": "Teacher",
    "الكورسات المرفوعة": "Uploaded Courses",
    "التقييم": "Rating",
    "المبلغ": "Amount",
    "المبلغ (EGP)": "Amount (EGP)",
    "كود التحويل": "Transfer Code",
    "الإيصال": "Receipt",
    "ملاحظات": "Notes",
    "التاريخ": "Date",
    "سجلات تشغيل وحماية الفيديوهات": "Video Playback & Security Logs",
    "المحاضرة": "Lecture",
    "عنوان IP": "IP Address",
    "الوقت": "Timestamp",
    "نشط": "Active",
    "معتمد": "Verified",
    "محتوى": "Content",
    "مباشر": "Live",
    "رصيد": "Balance",
    "معطل": "Disabled",
    "تفعيل": "Enable",
    "تعطيل": "Disable",
    "نشط ✓": "Active ✓",
    "معطل ✕": "Disabled ✕",
    "مكتمل": "Completed",
    "معلق": "Pending",
    "مرفوض": "Rejected",
    "مقبول": "Approved",
    "موافقة": "Approve",
    "موافقة ✓": "Approve ✓",
    "رفض": "Reject",
    "رفض ✕": "Reject ✕",
    "ج.م": "EGP",
    "نقطة": "Points",
    "كورس": "Course",

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

    // ─── Auth ───
    "ادخل بيانات حسابك لمتابعة حصصك أو إدارة كورساتك": "Enter your account details to resume lectures or manage courses",
    "اسم المستخدم": "Username",
    "كلمة المرور": "Password",
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

    // ─── Landing Page ───
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
    "مجاني": "Free",
    "اشترك الآن": "Enroll Now",
    "مشترك بالفعل": "Enrolled",
    "ابدأ رحلتك التعليمية الآن مع خطوة": "Start Your Learning Journey Now with Khatwa",
    "انضم لآلاف الطلاب وابدأ بمتابعة حصصك وامتحاناتك بكل سهولة.": "Join thousands of students and start tracking your classes and exams easily.",
    "إنشاء حساب الآن": "Create Account Now",
    "© 2026 خطوة — جميع الحقوق محفوظة": "© 2026 Khatwa — All Rights Reserved",

    // ─── Months ───
    "يناير": "January",
    "فبراير": "February",
    "مارس": "March",
    "أبريل": "April",
    "مايو": "May",
    "يونيو": "June",
    "يوليو": "July",
    "أغسطس": "August",
    "سبتمبر": "September",
    "أكتوبر": "October",
    "نوفمبر": "November",
    "ديسمبر": "December"
  };

  // Arabic numerals to Latin numerals
  const ARABIC_DIGITS = { '٠':'0', '١':'1', '٢':'2', '٣':'3', '٤':'4', '٥':'5', '٦':'6', '٧':'7', '٨':'8', '٩':'9' };

  // Reverse mapping (English -> Arabic)
  const REVERSE_DICT = {};
  for (const [ar, en] of Object.entries(DICTIONARY)) {
    REVERSE_DICT[en] = ar;
  }

  // Pre-sorted phrases by length descending
  const AR_PHRASES = Object.keys(DICTIONARY).sort((a, b) => b.length - a.length);
  const EN_PHRASES = Object.keys(REVERSE_DICT).sort((a, b) => b.length - a.length);

  // WeakMaps for preserving exact original values
  const textNodeMap = new WeakMap();
  const placeholderMap = new WeakMap();
  const titleMap = new WeakMap();

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
   * Translates a single text string using dictionary & regex rules
   */
  function translateString(str, lang) {
    if (!str || typeof str !== 'string') return str;
    const trimmed = str.trim();
    if (!trimmed) return str;

    if (lang === 'en') {
      // 1. Direct dictionary match
      if (DICTIONARY[trimmed]) {
        return str.replace(trimmed, DICTIONARY[trimmed]);
      }

      // 2. Dynamic pattern replacements (regex)
      let result = str;

      // Handle "عرض X طالب" -> "Showing X Students"
      result = result.replace(/عرض\s+([0-9٠-٩]+)\s+طالب/g, 'Showing $1 Students');
      // Handle "إدارة ومتابعة الطلاب (X)" -> "Students Directory (X)"
      result = result.replace(/إدارة ومتابعة الطلاب\s*\(([0-9٠-٩]+)\)/g, 'Students Directory ($1)');
      // Handle "إدارة المدرسين (X)" -> "Teachers Directory (X)"
      result = result.replace(/إدارة المدرسين\s*\(([0-9٠-٩]+)\)/g, 'Teachers Directory ($1)');
      // Handle "X كورس" -> "X Courses"
      result = result.replace(/([0-9٠-٩]+)\s+كورس/g, '$1 Courses');
      // Handle "X محاضرات" -> "X Lectures"
      result = result.replace(/([0-9٠-٩]+)\s+محاضرات/g, '$1 Lectures');
      result = result.replace(/([0-9٠-٩]+)\s+محاضرة/g, '$1 Lecture');
      // Handle "X نقطة" -> "X Points"
      result = result.replace(/([0-9٠-٩]+)\s+نقطة/g, '$1 Points');
      // Handle "X ج.م" -> "X EGP"
      result = result.replace(/([0-9٠-٩\.]+)\s+ج\.م/g, '$1 EGP');

      // Convert Arabic digits in dates/numbers
      result = result.replace(/[٠-٩]/g, d => ARABIC_DIGITS[d] || d);

      // 3. Multi-phrase token replacement (longest first)
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
   * Deeply translates a DOM tree (Text Nodes + Attributes)
   */
  function translateTree(rootNode, lang) {
    if (!rootNode) return;

    // 1. Process inputs & textareas
    const inputs = rootNode.querySelectorAll ? rootNode.querySelectorAll('input, textarea') : [];
    inputs.forEach(inp => {
      if (inp.placeholder) {
        if (!placeholderMap.has(inp)) placeholderMap.set(inp, inp.placeholder);
        const orig = placeholderMap.get(inp);
        inp.placeholder = lang === 'en' ? translateString(orig, 'en') : orig;
      }
      if (inp.title) {
        if (!titleMap.has(inp)) titleMap.set(inp, inp.title);
        const orig = titleMap.get(inp);
        inp.title = lang === 'en' ? translateString(orig, 'en') : orig;
      }
    });

    // 2. Process all text nodes
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

    // 1. Root direction & language attributes
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

  // MutationObserver to translate dynamic additions
  let observer = null;
  let debounceTimer = null;
  function initObserver() {
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(() => {
      if (getLanguage() === 'en') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (document.body) translateTree(document.body, 'en');
        }, 50);
      }
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyLanguage(getLanguage());
      initObserver();
    });
  } else {
    applyLanguage(getLanguage());
    initObserver();
  }

  // Format Date Helper
  function formatDate(dateInput) {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';
    const lang = getLanguage();
    if (lang === 'en') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else {
      return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  window.KhatwaI18n = {
    t: (key, fallback = '') => (getLanguage() === 'en' ? translateString(key, 'en') || fallback || key : key),
    formatDate,
    getLanguage,
    setLanguage,
    toggleLanguage,
    applyLanguage,
    translateElement: (el) => translateTree(el, getLanguage()),
    DICTIONARY
  };
})(window);
