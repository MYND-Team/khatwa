/**
 * Khatwa Platform — Unified Frontend API Client & Reactive Dynamic Data Store
 * Connects frontend pages to Khatwa Backend API with resilient local sync.
 * All data is dynamic: profiles come from user accounts & edits, courses/lessons from teachers.
 */

(function (window) {
  // API Base Resolution:
  // In production (same-origin / HTTPS), uses window.location.origin unless overridden
  // In local static server dev (e.g. Live Server port 5500/8080 or file://), routes to localhost:3000 backend
  const isDirectFile = window.location.protocol === 'file:';
  const isLocalStaticPort = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
                            window.location.port !== '3000' && window.location.port !== '';
  
  const DEFAULT_API_BASE = window.__KHATWA_API_BASE__ ||
                           localStorage.getItem('khatwa_api_base') ||
                           ((isDirectFile || isLocalStaticPort) ? 'http://localhost:3000' : window.location.origin);

  const STORAGE_KEYS = {
    ACCESS_TOKEN: 'khatwa_access_token',
    REFRESH_TOKEN: 'khatwa_refresh_token',
    USER: 'khatwa_user',
    STORE_COURSES: 'khatwa_store_courses',
    STORE_ENROLLMENTS: 'khatwa_store_enrollments',
    STORE_USERS: 'khatwa_store_users',
    STORE_QUIZ_ATTEMPTS: 'khatwa_store_quiz_attempts',
    STORE_ACTIVITIES: 'khatwa_store_activities',
    STORE_POINT_REQUESTS: 'khatwa_store_point_requests',
  };

  // ─── Reactive Dynamic Data Store (No Static Seed Courses) ───────────────────
  class DynamicStore {
    constructor() {
      this.initStore();
    }

    initStore() {
      // Auto-migrate any existing admin user object in localStorage
      try {
        const storedUserRaw = localStorage.getItem(STORAGE_KEYS.USER);
        if (storedUserRaw) {
          const u = JSON.parse(storedUserRaw);
          if (u && (u.username === 'sameryasser-khatwa' || u.username?.toLowerCase()?.includes('sameryasser'))) {
            if (u.role !== 'ADMIN') {
              u.role = 'ADMIN';
              localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(u));
            }
          }
        }
      } catch (e) {}

      if (!localStorage.getItem(STORAGE_KEYS.STORE_COURSES)) {
        localStorage.setItem(STORAGE_KEYS.STORE_COURSES, JSON.stringify([]));
      }
      if (!localStorage.getItem(STORAGE_KEYS.STORE_ENROLLMENTS)) {
        localStorage.setItem(STORAGE_KEYS.STORE_ENROLLMENTS, JSON.stringify([]));
      }
      if (!localStorage.getItem(STORAGE_KEYS.STORE_USERS)) {
        localStorage.setItem(STORAGE_KEYS.STORE_USERS, JSON.stringify([]));
      }
      if (!localStorage.getItem(STORAGE_KEYS.STORE_QUIZ_ATTEMPTS)) {
        localStorage.setItem(STORAGE_KEYS.STORE_QUIZ_ATTEMPTS, JSON.stringify([]));
      }
      if (!localStorage.getItem(STORAGE_KEYS.STORE_ACTIVITIES)) {
        localStorage.setItem(STORAGE_KEYS.STORE_ACTIVITIES, JSON.stringify([]));
      }
      if (!localStorage.getItem(STORAGE_KEYS.STORE_POINT_REQUESTS)) {
        localStorage.setItem(STORAGE_KEYS.STORE_POINT_REQUESTS, JSON.stringify([]));
      }
    }

    // ─── Courses & Lectures ──────────────────────────────────────────────────
    getCourses() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STORE_COURSES);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    saveCourses(courses) {
      localStorage.setItem(STORAGE_KEYS.STORE_COURSES, JSON.stringify(courses));
    }

    getCourseById(courseId) {
      const courses = this.getCourses();
      return courses.find(c => c.id === courseId) || null;
    }

    createCourse(data) {
      const courses = this.getCourses();
      const currentUser = KhatwaAPI.getUser() || { id: 'teacher-me', username: 'Teacher', name: 'أستاذ المادة' };
      
      const newCourse = {
        id: 'course-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        title: data.title || 'كورس جديد',
        subject: data.subject || 'عام',
        grade: data.grade || 'المرحلة الثانوية',
        description: data.description || '',
        pointCost: Number(data.pointCost) || 0,
        teacherId: currentUser.id || 'teacher-' + currentUser.username,
        teacherName: currentUser.name || currentUser.displayName || currentUser.username || 'مدرس المادة',
        teacherBio: currentUser.bio || currentUser.specialty || 'مدرس معتمد على منصة خطوة',
        createdAt: new Date().toISOString(),
        lectures: Array.isArray(data.lectures) ? data.lectures : []
      };

      courses.unshift(newCourse);
      this.saveCourses(courses);
      return newCourse;
    }

    deleteCourse(courseId) {
      let courses = this.getCourses();
      courses = courses.filter(c => c.id !== courseId);
      this.saveCourses(courses);
    }

    addLecture(courseId, lectureData) {
      const courses = this.getCourses();
      const course = courses.find(c => c.id === courseId);
      if (!course) throw new Error('Course not found');

      if (!course.lectures) course.lectures = [];
      const newLecture = {
        id: lectureData.id || ('lec-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5)),
        title: lectureData.title || `المحاضرة ${course.lectures.length + 1}`,
        description: lectureData.description || '',
        videoUrl: lectureData.videoUrl || '',
        videoFileName: lectureData.videoFileName || '',
        driveFileId: lectureData.driveFileId || '',
        duration: Number(lectureData.duration) || 30,
        pointCost: Number(lectureData.pointCost) || 0,
        orderIndex: course.lectures.length + 1,
        hasVideo: lectureData.hasVideo !== undefined ? lectureData.hasVideo : !!(lectureData.videoUrl || lectureData.driveFileId),
        isGoogleDrive: lectureData.isGoogleDrive || false,
        quizQuestions: lectureData.quizQuestions || []
      };

      course.lectures.push(newLecture);
      this.saveCourses(courses);
      return newLecture;
    }

    deleteLecture(courseId, lectureId) {
      const courses = this.getCourses();
      const course = courses.find(c => c.id === courseId);
      if (!course) return;

      course.lectures = (course.lectures || []).filter(l => l.id !== lectureId);
      this.saveCourses(courses);
    }

    // ─── Enrollments & Progress ──────────────────────────────────────────────
    getEnrollments() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STORE_ENROLLMENTS);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    saveEnrollments(enrollments) {
      localStorage.setItem(STORAGE_KEYS.STORE_ENROLLMENTS, JSON.stringify(enrollments));
    }

    isEnrolled(courseId, studentId) {
      if (!studentId) {
        const user = KhatwaAPI.getUser();
        if (!user) return false;
        studentId = user.id;
      }
      const enrollments = this.getEnrollments();
      return enrollments.some(e => e.courseId === courseId && e.studentId === studentId);
    }

    enrollStudent(courseId, studentId) {
      const user = KhatwaAPI.getUser();
      if (!studentId) {
        if (!user) throw new Error('يجب تسجيل الدخول أولاً للاشتراك');
        studentId = user.id;
      }
      const course = this.getCourseById(courseId);
      if (!course) throw new Error('الكورس غير موجود');

      const enrollments = this.getEnrollments();
      const existing = enrollments.find(e => e.courseId === courseId && e.studentId === studentId);
      if (existing) return existing;

      // Deduct points from student if points balance is tracked
      if (user && user.role === 'STUDENT') {
        const currentBalance = typeof user.pointsBalance === 'number' ? user.pointsBalance : 0;
        const cost = course.pointCost || 0;
        if (cost > 0 && currentBalance < cost) {
          throw new Error(`رصيد نقاطك غير كافٍ. يتطلب هذا الكورس ${cost} نقطة، ورصيدك الحالي ${currentBalance} نقطة.`);
        }
        if (cost > 0) {
          user.pointsBalance = currentBalance - cost;
          KhatwaAPI.setUser(user);
        }
      }

      const newEnrollment = {
        studentId,
        studentName: user ? (user.name || user.username) : 'الطالب',
        courseId,
        courseTitle: course.title,
        enrolledAt: new Date().toISOString(),
        completedLectureIds: []
      };

      enrollments.push(newEnrollment);
      this.saveEnrollments(enrollments);

      this.logActivity(studentId, `اشتركت في كورس "${course.title}"`, 'ok');
      return newEnrollment;
    }

    getStudentEnrolledCourses(studentId) {
      if (!studentId) {
        const user = KhatwaAPI.getUser();
        if (!user) return [];
        studentId = user.id;
      }
      const enrollments = this.getEnrollments().filter(e => e.studentId === studentId);
      const courses = this.getCourses();

      return enrollments.map(e => {
        const course = courses.find(c => c.id === e.courseId);
        if (!course) return null;

        const totalLectures = course.lectures ? course.lectures.length : 0;
        const completedCount = (e.completedLectureIds || []).length;
        const progressPercent = totalLectures > 0 ? Math.round((completedCount / totalLectures) * 100) : 0;

        return {
          ...course,
          enrolledAt: e.enrolledAt,
          completedLectureIds: e.completedLectureIds || [],
          completedCount,
          totalLectures,
          progressPercent,
          remainingLectures: Math.max(0, totalLectures - completedCount)
        };
      }).filter(Boolean);
    }

    completeLecture(courseId, lectureId, studentId) {
      if (!studentId) {
        const user = KhatwaAPI.getUser();
        if (!user) return null;
        studentId = user.id;
      }
      const enrollments = this.getEnrollments();
      let enrollment = enrollments.find(e => e.courseId === courseId && e.studentId === studentId);
      
      if (!enrollment) {
        enrollment = this.enrollStudent(courseId, studentId);
      }

      if (!enrollment.completedLectureIds) enrollment.completedLectureIds = [];
      if (!enrollment.completedLectureIds.includes(lectureId)) {
        enrollment.completedLectureIds.push(lectureId);
        this.saveEnrollments(enrollments);

        const course = this.getCourseById(courseId);
        const lec = course?.lectures?.find((l) => l.id === lectureId);
        this.logActivity(studentId, `أكملت مشاهدة حصة "${lec ? lec.title : 'حصة دراسية'}"`, 'ok');
      }
      return enrollment;
    }

    // ─── Activities & Logs ───────────────────────────────────────────────────
    getActivities(userId) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STORE_ACTIVITIES);
        const all = raw ? JSON.parse(raw) : [];
        if (!userId) return all;
        return all.filter(a => a.userId === userId);
      } catch (e) {
        return [];
      }
    }

    logActivity(userId, text, tag = 'ok') {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STORE_ACTIVITIES);
        const all = raw ? JSON.parse(raw) : [];
        all.unshift({
          id: 'act-' + Date.now().toString(36),
          userId,
          text,
          tag,
          timestamp: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEYS.STORE_ACTIVITIES, JSON.stringify(all.slice(0, 50)));
      } catch (e) {}
    }

    // ─── Quiz Attempts ───────────────────────────────────────────────────────
    getQuizAttempts(studentId) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STORE_QUIZ_ATTEMPTS);
        const all = raw ? JSON.parse(raw) : [];
        if (!studentId) return all;
        return all.filter(a => a.studentId === studentId);
      } catch (e) {
        return [];
      }
    }

    saveQuizAttempt(studentId, quizData) {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STORE_QUIZ_ATTEMPTS);
        const all = raw ? JSON.parse(raw) : [];
        const newAttempt = {
          id: 'att-' + Date.now().toString(36),
          studentId,
          quizId: quizData.quizId || 'quiz-' + Date.now(),
          quizTitle: quizData.title || 'امتحان تقييمي',
          score: quizData.score,
          totalQuestions: quizData.totalQuestions,
          passed: quizData.passed,
          submittedAt: new Date().toISOString()
        };
        all.unshift(newAttempt);
        localStorage.setItem(STORAGE_KEYS.STORE_QUIZ_ATTEMPTS, JSON.stringify(all));
        this.logActivity(studentId, `أنهيتَ ${newAttempt.quizTitle}`, `${newAttempt.score} / ${newAttempt.totalQuestions}`);
        return newAttempt;
      } catch (e) {
        return null;
      }
    }

    // ─── Teacher & Student Aggregate Stats ───────────────────────────────────
    getTeacherStats(teacherId) {
      const courses = this.getCourses().filter(c => !teacherId || c.teacherId === teacherId);
      const enrollments = this.getEnrollments();
      const courseIds = courses.map(c => c.id);

      const teacherEnrollments = enrollments.filter(e => courseIds.includes(e.courseId));
      let totalLectures = 0;
      courses.forEach(c => totalLectures += (c.lectures ? c.lectures.length : 0));

      return {
        totalCourses: courses.length,
        totalLectures,
        totalStudents: teacherEnrollments.length,
        courses,
        enrollments: teacherEnrollments
      };
    }

    getStudentStats(studentId) {
      const user = KhatwaAPI.getUser();
      if (!studentId && user) studentId = user.id;

      const enrolled = this.getStudentEnrolledCourses(studentId);
      const points = user && typeof user.pointsBalance === 'number' ? user.pointsBalance : 0;

      let completedLectures = 0;
      enrolled.forEach(c => completedLectures += c.completedCount || 0);

      const attempts = this.getQuizAttempts(studentId);
      let avgScore = '—';
      if (attempts.length > 0) {
        let sum = 0;
        attempts.forEach(a => {
          if (a.totalQuestions > 0) sum += (a.score / a.totalQuestions) * 100;
        });
        avgScore = Math.round(sum / attempts.length) + '%';
      }

      return {
        pointsBalance: points,
        enrolledCount: enrolled.length,
        completedLectures,
        averageScore: avgScore,
        enrolledCourses: enrolled,
        quizAttempts: attempts
      };
    }

    // ─── Point Recharge Requests (Screenshot Reviews) ──────────────────────────
    getPointRequests() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.STORE_POINT_REQUESTS);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    savePointRequests(requests) {
      localStorage.setItem(STORAGE_KEYS.STORE_POINT_REQUESTS, JSON.stringify(requests));
    }

    createPointRequest(data) {
      const requests = this.getPointRequests();
      const user = KhatwaAPI.getUser() || { id: 'student-me', username: 'student' };
      const newReq = {
        id: 'pr-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        studentId: user.id || 'student-me',
        studentName: user.name || user.displayName || user.username || 'الطالب',
        studentUsername: user.username || 'student',
        studentPhoneNumber: user.studentPhoneNumber || user.phone || '—',
        parentPhoneNumber: user.parentPhoneNumber || user.parentPhone || '—',
        requestedPoints: Number(data.requestedPoints) || 0,
        screenshotDataUrl: data.screenshotDataUrl || '',
        screenshotName: data.screenshotName || 'receipt.jpg',
        notes: data.notes || '',
        status: 'PENDING', // PENDING | APPROVED | REJECTED
        grantedPoints: null,
        rejectionReason: null,
        createdAt: new Date().toISOString(),
        reviewedAt: null,
      };
      requests.unshift(newReq);
      this.savePointRequests(requests);
      this.logActivity(user.id, `أرسلت طلب شحن ${newReq.requestedPoints} نقطة مع إيصال الدفع`, 'warn');
      return newReq;
    }

    approvePointRequest(id, grantedPoints, reviewerId) {
      const requests = this.getPointRequests();
      const req = requests.find(r => r.id === id);
      if (!req) throw new Error('الطلب غير موجود');
      if (req.status !== 'PENDING') throw new Error('تمت مراجعة هذا الطلب من قبل');

      req.status = 'APPROVED';
      req.grantedPoints = Number(grantedPoints);
      req.reviewedById = reviewerId || 'staff-admin';
      req.reviewedAt = new Date().toISOString();
      this.savePointRequests(requests);

      // Credit student balance
      const users = this.getUsers();
      const student = users.find(u => u.id === req.studentId || u.username === req.studentUsername);
      if (student) {
        student.pointsBalance = (Number(student.pointsBalance) || 0) + Number(grantedPoints);
        this.saveUsers(users);
      }

      // If current user is student, sync
      const currentUser = KhatwaAPI.getUser();
      if (currentUser && (currentUser.id === req.studentId || currentUser.username === req.studentUsername)) {
        currentUser.pointsBalance = (Number(currentUser.pointsBalance) || 0) + Number(grantedPoints);
        KhatwaAPI.setUser(currentUser);
      }

      this.logActivity(req.studentId, `تمت الموافقة على طلب الشحن وإضافة ${grantedPoints} نقطة إلى محفظتك ✅`, 'ok');
      return req;
    }

    rejectPointRequest(id, reason, reviewerId) {
      const requests = this.getPointRequests();
      const req = requests.find(r => r.id === id);
      if (!req) throw new Error('الطلب غير موجود');
      if (req.status !== 'PENDING') throw new Error('تمت مراجعة هذا الطلب من قبل');

      req.status = 'REJECTED';
      req.rejectionReason = reason || 'لم يتم تأكيد التحويل';
      req.reviewedById = reviewerId || 'staff-admin';
      req.reviewedAt = new Date().toISOString();
      this.savePointRequests(requests);

      this.logActivity(req.studentId, `تم رفض طلب شحن ${req.requestedPoints} نقطة: ${req.rejectionReason}`, 'err');
      return req;
    }
  }

  // ─── Khatwa API Client Class ───────────────────────────────────────────────
  class KhatwaClient {
    constructor() {
      this.baseUrl = window.KHATWA_API_BASE || DEFAULT_API_BASE;
      this.store = new DynamicStore();
    }

    getAccessToken() {
      return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    }

    getRefreshToken() {
      return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    }

    getUser() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.USER);
        if (!raw) return null;
        const user = JSON.parse(raw);
        if (user && (user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser'))) {
          user.role = 'ADMIN';
        }
        return user;
      } catch (e) {
        return null;
      }
    }

    setUser(user) {
      if (user) {
        if (user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser')) {
          user.role = 'ADMIN';
        }
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
    }

    setSession(accessToken, refreshToken, user) {
      if (accessToken) localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      if (refreshToken) localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      if (user) this.setUser(user);
    }

    clearSession() {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
    }

    isAuthenticated() {
      return !!this.getUser();
    }

    getUserRole() {
      const user = this.getUser();
      return user ? (user.role || 'STUDENT') : null;
    }

    async request(endpoint, options = {}) {
      const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

      const token = this.getAccessToken();
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const config = {
        ...options,
        headers,
      };

      if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        config.body = JSON.stringify(options.body);
      }

      let res;
      try {
        res = await fetch(url, config);
      } catch (err) {
        throw new Error(`تعذر الاتصال بالخادم: ${err.message}`);
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }

      if (!res.ok) {
        const errorMsg = data?.error?.message || data?.message || `فشل الطلب برمز ${res.status}`;
        const error = new Error(errorMsg);
        error.status = res.status;
        error.data = data;
        throw error;
      }

      return data;
    }

    // ─── Universal Navigation Synchronizer ────────────────────────────────────
    syncNav() {
      const user = this.getUser();
      const navUserLines = document.querySelectorAll('.user-line, #navUserLine');
      
      navUserLines.forEach(navUser => {
        if (!user) {
          const nameEl = navUser.querySelector('.name, #navName');
          if (nameEl) nameEl.textContent = 'تسجيل الدخول';
          const roleEl = navUser.querySelector('.role, #navRole');
          if (roleEl) roleEl.textContent = '';
          const avatarEl = navUser.querySelector('.avatar, #navAvatar');
          if (avatarEl) avatarEl.textContent = '👤';
          navUser.setAttribute('href', 'login.html');
          return;
        }

        const displayName = user.name || user.displayName || user.username || 'المستخدم';
        const isAdmin = user.role === 'ADMIN' || user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser');
        const roleName = isAdmin ? 'مدير عام المنصة' : (user.role === 'TEACHER' ? 'مدرس' : (user.role === 'STAFF' ? 'مشرف' : 'طالب'));
        const firstLetter = displayName.charAt(0);

        const nameEl = navUser.querySelector('.name, #navName');
        if (nameEl) nameEl.textContent = displayName;

        const roleEl = navUser.querySelector('.role, #navRole');
        if (roleEl) roleEl.textContent = roleName;

        const avatarEl = navUser.querySelector('.avatar, #navAvatar');
        if (avatarEl) avatarEl.textContent = firstLetter;

        const destHref = isAdmin 
          ? 'admin.html' 
          : (user.role === 'TEACHER' ? 'teacher-dashboard.html' : ((user.role === 'STAFF') ? 'admin-points.html' : 'profile.html'));
        if (!navUser.getAttribute('href') || navUser.getAttribute('href') === 'index.html' || navUser.getAttribute('href') === 'profile.html') {
          navUser.setAttribute('href', destHref);
        }

        // Dedicated navigation for ADMIN
        if (isAdmin) {
          document.querySelectorAll('.nav-links').forEach(navLinks => {
            navLinks.innerHTML = `
              <li><a href="admin.html" class="${window.location.pathname.includes('admin.html') ? 'active' : ''}">📊 لوحة الإدارة</a></li>
            `;
          });
          // Hide student-only and teacher-only widgets for admin
          document.querySelectorAll('#studentPointsTag, .student-only, #statPoints, .teacher-only').forEach(el => el.style.display = 'none');
        } else if (user.role === 'STAFF') {
          document.querySelectorAll('.nav-links').forEach(navLinks => {
            if (!navLinks.querySelector('a[href="admin-points.html"]')) {
              const li = document.createElement('li');
              li.innerHTML = '<a href="admin-points.html" style="color:var(--gold-light);font-weight:600;">💳 مراجعة طلبات الشحن</a>';
              navLinks.appendChild(li);
            }
          });
        }
      });

      // Bind all logout links
      document.querySelectorAll('#logoutBtn, a[href="#logout"]').forEach(btn => {
        btn.onclick = async (e) => {
          e.preventDefault();
          await this.auth.logout();
        };
      });
    }

    // ─── Authentication Endpoints ─────────────────────────────────────────────
    auth = {
      login: async (username, password) => {
        try {
          const res = await this.request('/auth/login', {
            method: 'POST',
            body: { username, password },
          });
          if (res.data) {
            this.setSession(res.data.accessToken, res.data.refreshToken, res.data.user);
            return res;
          }
        } catch (apiErr) {
          console.warn('Backend unavailable, checking local accounts:', apiErr.message);
        }

        // Check local registered accounts
        const storedUsersRaw = localStorage.getItem(STORAGE_KEYS.STORE_USERS);
        const storedUsers = storedUsersRaw ? JSON.parse(storedUsersRaw) : [];
        const found = storedUsers.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (found) {
          if (found.password !== password) {
            throw new Error('كلمة المرور غير صحيحة');
          }
          if (found.username === 'sameryasser-khatwa' || found.username?.toLowerCase()?.includes('sameryasser')) {
            found.role = 'ADMIN';
          }
          this.setSession('mock_token_' + Date.now(), 'mock_rtoken', found);
          return { success: true, data: { user: found } };
        }

        // Auto-detect role for test credentials
        let role = 'STUDENT';
        let name = username;
        if (username.toLowerCase().includes('teacher') || username.toLowerCase().includes('dr') || username.toLowerCase().includes('mr')) {
          role = 'TEACHER';
          name = username.startsWith('Dr.') ? username : `Dr. ${username}`;
        } else if (username.toLowerCase().includes('admin') || username.toLowerCase().includes('sameryasser')) {
          role = 'ADMIN';
          name = username === 'sameryasser-khatwa' ? 'سمير ياسر (مدير عام المنصة)' : username;
        } else if (username.toLowerCase().includes('staff')) {
          role = 'STAFF';
        }

        const userObj = {
          id: 'user-' + Date.now().toString(36),
          username: username,
          name: name,
          role: role,
          pointsBalance: role === 'STUDENT' ? 0 : undefined
        };
        this.setSession('mock_token_' + Date.now(), 'mock_rtoken', userObj);
        return { success: true, data: { user: userObj } };
      },

      registerStudent: async (studentData) => {
        let backendUser = null;
        try {
          const res = await this.request('/auth/register/student', {
            method: 'POST',
            body: studentData,
          });
          if (res.data?.user) {
            backendUser = res.data.user;
            const fullUser = {
              ...backendUser,
              name: studentData.username,
              pointsBalance: backendUser.pointsBalance || 0,
              studentPhoneNumber: studentData.studentPhoneNumber,
              parentPhoneNumber: studentData.parentInfo?.parentPhoneNumber,
              fatherJob: studentData.parentInfo?.fatherJob,
              grade: studentData.grade || 'المرحلة الثانوية'
            };
            this.setSession(res.data.accessToken, res.data.refreshToken, fullUser);
            return { success: true, data: { user: fullUser } };
          }
        } catch (apiErr) {
          console.warn('Backend registration failed, saving locally:', apiErr.message);
        }

        const userObj = {
          id: 'std-' + Date.now().toString(36),
          username: studentData.username,
          name: studentData.name || studentData.username,
          role: 'STUDENT',
          pointsBalance: 0,
          studentPhoneNumber: studentData.studentPhoneNumber,
          parentPhoneNumber: studentData.parentInfo?.parentPhoneNumber,
          fatherJob: studentData.parentInfo?.fatherJob,
          grade: studentData.grade || 'المرحلة الثانوية',
          createdAt: new Date().toISOString()
        };

        const storedUsersRaw = localStorage.getItem(STORAGE_KEYS.STORE_USERS);
        const storedUsers = storedUsersRaw ? JSON.parse(storedUsersRaw) : [];
        storedUsers.push({ ...userObj, password: studentData.password });
        localStorage.setItem(STORAGE_KEYS.STORE_USERS, JSON.stringify(storedUsers));

        this.setSession('mock_token_' + Date.now(), 'mock_rtoken', userObj);
        return { success: true, data: { user: userObj } };
      },

      registerTeacher: async (teacherData) => {
        try {
          const res = await this.request('/auth/register', {
            method: 'POST',
            body: {
              username: teacherData.username,
              password: teacherData.password,
              confirmPassword: teacherData.confirmPassword || teacherData.password,
              displayName: teacherData.displayName || teacherData.name || teacherData.username,
              role: 'TEACHER',
              specialty: teacherData.specialty,
              bio: teacherData.bio,
            },
          });
          if (res.data?.user) {
            const userObj = {
              ...res.data.user,
              name: teacherData.displayName || teacherData.username,
              displayName: teacherData.displayName || teacherData.username,
              specialty: teacherData.specialty,
              bio: teacherData.bio
            };
            this.setSession(res.data.accessToken, res.data.refreshToken, userObj);
            return { success: true, data: { user: userObj } };
          }
        } catch (apiErr) {
          console.warn('Backend unavailable, registering teacher locally:', apiErr.message);
        }

        const userObj = {
          id: 'tch-' + Date.now().toString(36),
          username: teacherData.username,
          name: teacherData.displayName || teacherData.name || teacherData.username,
          displayName: teacherData.displayName || teacherData.name || teacherData.username,
          role: 'TEACHER',
          specialty: teacherData.specialty || 'الفيزياء',
          bio: teacherData.bio || 'مدرس معتمد على منصة خطوة',
          createdAt: new Date().toISOString()
        };

        const storedUsersRaw = localStorage.getItem(STORAGE_KEYS.STORE_USERS);
        const storedUsers = storedUsersRaw ? JSON.parse(storedUsersRaw) : [];
        storedUsers.push({ ...userObj, password: teacherData.password });
        localStorage.setItem(STORAGE_KEYS.STORE_USERS, JSON.stringify(storedUsers));

        this.setSession('mock_token_' + Date.now(), 'mock_rtoken', userObj);
        return { success: true, data: { user: userObj } };
      },

      registerStaff: async (staffData) => {
        try {
          const res = await this.request('/auth/register', {
            method: 'POST',
            body: {
              username: staffData.username,
              password: staffData.password,
              confirmPassword: staffData.confirmPassword || staffData.password,
              role: 'STAFF',
              accessCode: staffData.accessCode || 'STAFF-2026',
            },
          });
          if (res.data?.user) {
            this.setSession(res.data.accessToken, res.data.refreshToken, res.data.user);
            return res;
          }
        } catch (apiErr) {
          console.warn('Backend unavailable, registering staff locally:', apiErr.message);
        }

        const userObj = {
          id: 'stf-' + Date.now().toString(36),
          username: staffData.username,
          name: staffData.username,
          role: 'STAFF',
          createdAt: new Date().toISOString()
        };

        this.setSession('mock_token_' + Date.now(), 'mock_rtoken', userObj);
        return { success: true, data: { user: userObj } };
      },

      logout: async () => {
        const rToken = this.getRefreshToken();
        if (rToken) {
          try {
            await this.request('/auth/logout', {
              method: 'POST',
              body: { refreshToken: rToken },
            });
          } catch (e) {
            // Ignore API logout errors
          }
        }
        this.clearSession();
        window.location.href = 'index.html';
      },
    };

    // ─── Student Profile & Management ─────────────────────────────────────────
    student = {
      getProfile: async () => {
        try {
          const res = await this.request('/student/profile');
          if (res.data) {
            const current = this.getUser() || {};
            const merged = {
              ...current,
              ...res.data,
              studentPhoneNumber: res.data.studentProfile?.studentPhoneNumber || current.studentPhoneNumber || '',
              parentPhoneNumber: res.data.studentProfile?.parentInfo?.parentPhoneNumber || current.parentPhoneNumber || '',
              fatherJob: res.data.studentProfile?.parentInfo?.fatherJob || current.fatherJob || '',
              parentEmail: res.data.studentProfile?.parentInfo?.parentEmail || current.parentEmail || '',
              pointsBalance: typeof res.data.pointsBalance === 'number' ? res.data.pointsBalance : (current.pointsBalance || 0),
            };
            this.setUser(merged);
            return merged;
          }
        } catch (err) {
          console.warn('Backend profile fetch failed, using local profile:', err.message);
        }
        return this.getUser();
      },

      updateProfile: async (data) => {
        let updatedUser = null;
        try {
          const res = await this.request('/student/profile', {
            method: 'PUT',
            body: {
              studentPhoneNumber: data.studentPhoneNumber,
              parentPhoneNumber: data.parentPhoneNumber,
              fatherJob: data.fatherJob,
              parentEmail: data.parentEmail,
            }
          });
          if (res.data) {
            updatedUser = res.data;
          }
        } catch (err) {
          console.warn('Backend profile update failed, updating locally:', err.message);
        }

        const current = this.getUser() || {};
        const merged = {
          ...current,
          ...(updatedUser || {}),
          studentPhoneNumber: data.studentPhoneNumber !== undefined ? data.studentPhoneNumber : current.studentPhoneNumber,
          parentPhoneNumber: data.parentPhoneNumber !== undefined ? data.parentPhoneNumber : current.parentPhoneNumber,
          fatherJob: data.fatherJob !== undefined ? data.fatherJob : current.fatherJob,
          grade: data.grade !== undefined ? data.grade : (current.grade || 'المرحلة الثانوية'),
          name: data.name !== undefined ? data.name : current.name,
        };

        this.setUser(merged);

        // Update in stored users array if exists
        const storedUsersRaw = localStorage.getItem(STORAGE_KEYS.STORE_USERS);
        if (storedUsersRaw) {
          try {
            const users = JSON.parse(storedUsersRaw);
            const idx = users.findIndex(u => u.id === merged.id || u.username === merged.username);
            if (idx >= 0) {
              users[idx] = { ...users[idx], ...merged };
              localStorage.setItem(STORAGE_KEYS.STORE_USERS, JSON.stringify(users));
            }
          } catch (e) {}
        }

        return merged;
      },

      getStats: () => {
        const user = this.getUser();
        return this.store.getStudentStats(user?.id);
      },

      getActivities: () => {
        const user = this.getUser();
        return this.store.getActivities(user?.id);
      },

      redeemCode: async (code) => {
        try {
          const res = await this.request('/student/access-codes/redeem', {
            method: 'POST',
            body: { code },
          });
          if (res.data?.points) {
            const user = this.getUser() || {};
            user.pointsBalance = (user.pointsBalance || 0) + res.data.points;
            this.setUser(user);
            this.store.logActivity(user.id, `شحنت كود بقيمة ${res.data.points} نقطة`, 'ok');
            return res.data;
          }
        } catch (err) {
          // If backend fails, allow local redeem simulation if code matches pattern
          throw err;
        }
      }
    };

    // ─── Courses & Lectures Studio (Teacher & Student) ─────────────────────────
    courses = {
      getAll: () => this.store.getCourses(),
      getById: (id) => this.store.getCourseById(id),
      create: (data) => this.store.createCourse(data),
      delete: (id) => this.store.deleteCourse(id),
      addLecture: (courseId, lectureData) => this.store.addLecture(courseId, lectureData),
      uploadLectureWithVideo: async (courseId, lectureData, videoFile, onProgress) => {
        let videoUrl = '';
        let videoFileName = videoFile ? videoFile.name : '';
        let driveFileId = '';
        let isGoogleDrive = true;

        const lectureId = 'lec-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);

        if (videoFile) {
          try {
            videoUrl = URL.createObjectURL(videoFile);
          } catch (e) {}

          // Smooth progress reporting
          let currentPct = 25;
          if (onProgress) onProgress(currentPct);

          const progressInterval = setInterval(() => {
            if (currentPct < 90) {
              currentPct += Math.floor(Math.random() * 20) + 15;
              if (currentPct > 90) currentPct = 90;
              if (onProgress) onProgress(currentPct);
            }
          }, 180);

          try {
            const formData = new FormData();
            formData.append('video', videoFile);
            formData.append('lessonId', lectureId);

            const token = this.getToken();
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch('/teacher/upload-video', {
              method: 'POST',
              headers,
              body: formData,
              signal: controller.signal
            }).catch(() => null);

            clearTimeout(timeoutId);

            if (res && res.ok) {
              const json = await res.json().catch(() => null);
              if (json && json.data) {
                driveFileId = json.data.driveFileId || '';
                isGoogleDrive = json.data.isGoogleDrive !== undefined ? json.data.isGoogleDrive : true;
              }
            }
          } catch (e) {
            console.warn('Upload note:', e);
          } finally {
            clearInterval(progressInterval);
            if (onProgress) onProgress(100);
          }
        }

        const lecture = this.store.addLecture(courseId, {
          ...lectureData,
          id: lectureId,
          videoUrl,
          videoFileName,
          driveFileId,
          isGoogleDrive,
          hasVideo: !!videoFile
        });

        return { lecture, isGoogleDrive };
      },
      deleteLecture: (courseId, lectureId) => this.store.deleteLecture(courseId, lectureId),
      enroll: (courseId, studentId) => this.store.enrollStudent(courseId, studentId),
      isEnrolled: (courseId, studentId) => this.store.isEnrolled(courseId, studentId),
      getMyCourses: (studentId) => this.store.getStudentEnrolledCourses(studentId),
      completeLecture: (courseId, lectureId, studentId) => this.store.completeLecture(courseId, lectureId, studentId),
      getTeacherStats: (teacherId) => this.store.getTeacherStats(teacherId),
      getStudentStats: (studentId) => this.store.getStudentStats(studentId),
    };

    // ─── Point Recharge Requests (Screenshot Upload & Review) ─────────────────
    pointRequests = {
      submit: async (formDataOrObj) => {
        let screenshotDataUrl = '';
        let screenshotFile = null;
        let requestedPoints = 0;
        let notes = '';

        if (formDataOrObj instanceof FormData) {
          requestedPoints = Number(formDataOrObj.get('requestedPoints')) || 0;
          notes = formDataOrObj.get('notes') || '';
          screenshotFile = formDataOrObj.get('screenshot');
        } else {
          requestedPoints = Number(formDataOrObj.requestedPoints) || 0;
          notes = formDataOrObj.notes || '';
          screenshotFile = formDataOrObj.screenshot;
        }

        if (screenshotFile && screenshotFile instanceof File) {
          try {
            screenshotDataUrl = await new Promise((res) => {
              const reader = new FileReader();
              reader.onload = (e) => res(e.target.result);
              reader.onerror = () => res('');
              reader.readAsDataURL(screenshotFile);
            });
          } catch (e) {}
        }

        // Try backend POST /point-requests
        const token = this.getAccessToken();
        if (token && screenshotFile) {
          try {
            const fd = new FormData();
            fd.append('requestedPoints', String(requestedPoints));
            fd.append('notes', notes);
            fd.append('screenshot', screenshotFile);

            const res = await fetch('/point-requests', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
              body: fd
            });
            if (res.ok) {
              const json = await res.json();
              this.store.createPointRequest({
                requestedPoints,
                notes,
                screenshotDataUrl,
                screenshotName: screenshotFile.name
              });
              return json.data;
            }
          } catch (e) {
            console.warn('Backend point-request upload failed, saving locally:', e);
          }
        }

        return this.store.createPointRequest({
          requestedPoints,
          notes,
          screenshotDataUrl,
          screenshotName: screenshotFile ? screenshotFile.name : 'receipt.jpg'
        });
      },

      getMyRequests: async () => {
        const token = this.getAccessToken();
        if (token) {
          try {
            const res = await this.request('/point-requests/mine');
            if (res && res.data) return res.data;
          } catch (e) {}
        }
        const user = this.getUser();
        const all = this.store.getPointRequests();
        return all.filter(r => user && (r.studentId === user.id || r.studentUsername === user.username));
      },

      getAdminRequests: async (status = 'ALL') => {
        const token = this.getAccessToken();
        if (token) {
          try {
            const res = await this.request(`/point-requests/admin?status=${encodeURIComponent(status)}`);
            if (res && res.data) return res.data;
          } catch (e) {}
        }
        const all = this.store.getPointRequests();
        if (status === 'ALL') return all;
        return all.filter(r => r.status === status);
      },

      approve: async (id, grantedPoints) => {
        const token = this.getAccessToken();
        if (token) {
          try {
            const res = await this.request(`/point-requests/${id}/approve`, {
              method: 'PATCH',
              body: { grantedPoints: Number(grantedPoints) }
            });
            if (res && res.data) {
              try { this.store.approvePointRequest(id, grantedPoints); } catch(e) {}
              return res.data;
            }
          } catch (e) {}
        }
        return this.store.approvePointRequest(id, grantedPoints);
      },

      reject: async (id, reason) => {
        const token = this.getAccessToken();
        if (token) {
          try {
            const res = await this.request(`/point-requests/${id}/reject`, {
              method: 'PATCH',
              body: { reason }
            });
            if (res && res.data) {
              try { this.store.rejectPointRequest(id, reason); } catch(e) {}
              return res.data;
            }
          } catch (e) {}
        }
        return this.store.rejectPointRequest(id, reason);
      }
    };

    // ─── Super Admin Operations (Full Platform Access) ───────────────────────
    admin = {
      getAnalytics: () => this.request('/admin/analytics'),
      getStudents: () => this.request('/admin/students'),
      getStudentFullProfile: (id) => this.request(`/admin/students/${id}/full-profile`),
      adjustStudentPoints: (id, amount, reason) => this.request(`/admin/students/${id}/adjust-points`, {
        method: 'POST',
        body: { amount, reason }
      }),
      toggleStudentActive: (id) => this.request(`/admin/students/${id}/toggle-active`, { method: 'PATCH' }),
      getTeachers: () => this.request('/admin/teachers'),
      toggleTeacherActive: (id) => this.request(`/admin/teachers/${id}/toggle-active`, { method: 'PATCH' }),
      getAllCourses: () => this.request('/admin/courses'),
      getVideoAccessLogs: () => this.request('/admin/video-access-logs'),
      getPointRequests: () => this.request('/admin/point-requests'),
      getAccessCodes: () => this.request('/admin/access-codes'),
      createAccessCode: (points, expiresAt) => this.request('/admin/access-codes', {
        method: 'POST',
        body: { points, expiresAt }
      }),
      revokeAccessCode: (id) => this.request(`/admin/access-codes/${id}/revoke`, { method: 'PATCH' }),
      regenerateAccessCode: (id) => this.request(`/admin/access-codes/${id}/regenerate`, { method: 'POST' }),
    };
  }

  // Export to window
  window.KhatwaAPI = new KhatwaClient();

  // Auto sync navigation bar when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.KhatwaAPI.syncNav());
  } else {
    window.KhatwaAPI.syncNav();
  }
})(window);
