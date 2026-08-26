/**
 * Khatwa Platform — Centralized i18n Translation Engine (Arabic RTL / English LTR)
 */

(function (window) {
  const translations = {
    ar: {
      brand: "خطوة",
      home: "الرئيسية",
      courses: "تصفح الكورسات",
      my_courses: "كورساتي",
      dashboard: "لوحتي التعليمية",
      admin_panel: "لوحة الإدارة",
      teacher_studio: "استوديو المعلم",
      help: "الأسئلة الشائعة",
      login: "تسجيل الدخول",
      signup: "إنشاء حساب",
      logout: "تسجيل الخروج",
      welcome: "أهلاً بك",
      role_student: "طالب",
      role_teacher: "مدرس",
      role_admin: "مدير عام المنصة",
      role_staff: "مشرف",
      
      // Academic Stages
      stage_prep: "المرحلة الإعدادية",
      stage_sec1: "الصف الأول الثانوي",
      stage_sec2: "الصف الثاني الثانوي",
      stage_sec3: "الصف الثالث الثانوي",
      all_stages: "جميع المراحل الدراسية",

      // Teacher Card & Discovery
      teachers_title: "نخبة مدرسي المنصة",
      teachers_subtitle: "تصفح نخبة من أفضل المعلمين والمحاضرين المتخصصين",
      lectures: "المحاضرات",
      view_courses: "عرض الكورسات",
      enroll_now: "اشترك الآن",
      enrolled: "مشترك بالفعل",
      free: "مجاني",
      points_cost: "نقطة",
      egp: "ج.م",

      // Lesson Access Progression
      step_assignment: "الخطوة 1: حل الواجب",
      step_exam: "الخطوة 2: اجتياز الاختبار",
      step_lesson: "الخطوة 3: مشاهدة المحاضرة والمحتوى",
      assignment_notice: "يجب تسليم الواجب أولاً لفتح الاختبار والمحاضرة.",
      exam_notice: "يجب اجتياز هذا الاختبار أولاً لفتح المحاضرة والملفات.",
      lesson_unlocked: "تم فتح المحاضرة بنجاح!",
      download_pdf: "تحميل مذكرة الدرس (PDF)",
      view_pdf: "معاينة الملف داخل المنصة",

      // Admin & Management
      admin_students: "إدارة الطلاب",
      admin_teachers: "إدارة المدرسين",
      add_teacher: "إضافة مدرس جديد",
      admin_wallet: "المحفظة والتحويلات",
      admin_points: "إدارة النقاط",
      student_notes: "ملاحظات الطالب",
      add_note: "إضافة ملاحظة",
      save: "حفظ",
      cancel: "إلغاء",
      search_placeholder: "بحث باسم المستخدم أو رقم الهاتف...",
      transfer_money: "تحويل رصيد مالي (EGP)",
      adjust_points: "تعديل رصيد النقاط",
      
      // Wallet Recharge
      recharge_title: "شحن المحفظة / النقاط",
      step1_upload: "1. رفع إيصال الدفع",
      step2_amount: "2. المبلغ المدفوع",
      step3_code: "3. كود التحويل / المعاملة",
      submit_request: "إرسال طلب الشحن",

      // General
      loading: "جارٍ التحميل...",
      success: "تمت العملية بنجاح",
      error: "حدث خطأ، يرجى المحاولة مرة أخرى",
      no_data: "لا توجد بيانات متاحة حالياً"
    },
    en: {
      brand: "Khatwa",
      home: "Home",
      courses: "Browse Courses",
      my_courses: "My Courses",
      dashboard: "Student Dashboard",
      admin_panel: "Admin Dashboard",
      teacher_studio: "Teacher Studio",
      help: "FAQ",
      login: "Login",
      signup: "Sign Up",
      logout: "Logout",
      welcome: "Welcome",
      role_student: "Student",
      role_teacher: "Teacher",
      role_admin: "Platform Director",
      role_staff: "Supervisor",

      // Academic Stages
      stage_prep: "Preparatory Stage",
      stage_sec1: "Secondary Year 1",
      stage_sec2: "Secondary Year 2",
      stage_sec3: "Secondary Year 3",
      all_stages: "All Academic Stages",

      // Teacher Card & Discovery
      teachers_title: "Featured Platform Teachers",
      teachers_subtitle: "Learn with the top specialized teachers and lecturers",
      lectures: "Lectures",
      view_courses: "View Courses",
      enroll_now: "Enroll Now",
      enrolled: "Enrolled",
      free: "Free",
      points_cost: "Points",
      egp: "EGP",

      // Lesson Access Progression
      step_assignment: "Step 1: Complete Assignment",
      step_exam: "Step 2: Pass Exam",
      step_lesson: "Step 3: Access Lecture & Content",
      assignment_notice: "You must submit the assignment first to unlock the exam and lecture.",
      exam_notice: "You must pass this exam first to unlock the lecture video and materials.",
      lesson_unlocked: "Lecture unlocked successfully!",
      download_pdf: "Download Lesson PDF",
      view_pdf: "View PDF in Browser",

      // Admin & Management
      admin_students: "Students Directory",
      admin_teachers: "Teachers Directory",
      add_teacher: "Add New Teacher",
      admin_wallet: "Wallet & Transfers",
      admin_points: "Points Management",
      student_notes: "Student Notes",
      add_note: "Add Note",
      save: "Save",
      cancel: "Cancel",
      search_placeholder: "Search by username or phone...",
      transfer_money: "Transfer Funds (EGP)",
      adjust_points: "Adjust Points Balance",

      // Wallet Recharge
      recharge_title: "Recharge Wallet / Points",
      step1_upload: "1. Upload Payment Receipt",
      step2_amount: "2. Paid Amount",
      step3_code: "3. Transfer / Reference Code",
      submit_request: "Submit Recharge Request",

      // General
      loading: "Loading...",
      success: "Operation successful",
      error: "An error occurred, please try again",
      no_data: "No data available currently"
    }
  };

  const currentLang = localStorage.getItem('khatwa_lang') || 'ar';

  function t(key, fallback = '') {
    const lang = localStorage.getItem('khatwa_lang') || 'ar';
    return translations[lang]?.[key] || translations['ar']?.[key] || fallback || key;
  }

  function setLanguage(lang) {
    if (lang !== 'ar' && lang !== 'en') lang = 'ar';
    localStorage.setItem('khatwa_lang', lang);
    applyLanguage(lang);
  }

  function toggleLanguage() {
    const nextLang = (localStorage.getItem('khatwa_lang') || 'ar') === 'ar' ? 'en' : 'ar';
    setLanguage(nextLang);
  }

  function applyLanguage(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    // Update all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key && translations[lang]?.[key]) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.getAttribute('placeholder')) el.placeholder = translations[lang][key];
        } else {
          el.textContent = translations[lang][key];
        }
      }
    });

    // Update language switcher button text
    document.querySelectorAll('.lang-switcher-btn').forEach(btn => {
      btn.innerHTML = lang === 'ar' ? '🌐 English' : '🌐 العربية';
    });
  }

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    applyLanguage(localStorage.getItem('khatwa_lang') || 'ar');
  });

  window.KhatwaI18n = {
    t,
    setLanguage,
    toggleLanguage,
    applyLanguage,
    getLanguage: () => localStorage.getItem('khatwa_lang') || 'ar',
    translations
  };
})(window);
