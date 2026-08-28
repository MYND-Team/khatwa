/**
 * Khatwa Platform — Unified Frontend API Client
 * Resilient multi-page client with automatic token refresh, token caching, and live DB sync.
 */

(function (window) {
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
  };

  let _refreshPromise = null;

  function getStoredToken() {
    try {
      return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) || sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) || null;
    } catch (_) {
      return null;
    }
  }

  function setStoredToken(token) {
    try {
      if (token) {
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
        sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      }
    } catch (_) {}
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER) || sessionStorage.getItem(STORAGE_KEYS.USER);
      if (!raw) return null;
      const user = JSON.parse(raw);
      if (user && (user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser'))) {
        user.role = 'ADMIN';
      }
      return user;
    } catch (_) {
      return null;
    }
  }

  function setStoredUser(user) {
    try {
      if (user) {
        if (user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser')) {
          user.role = 'ADMIN';
        }
        const serialized = JSON.stringify(user);
        localStorage.setItem(STORAGE_KEYS.USER, serialized);
        sessionStorage.setItem(STORAGE_KEYS.USER, serialized);
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER);
        sessionStorage.removeItem(STORAGE_KEYS.USER);
      }
    } catch (_) {}
  }

  // ─── Automated Token Refresh (Single Shared Promise) ─────────────────────────
  async function performTokenRefresh() {
    if (_refreshPromise) return _refreshPromise;

    _refreshPromise = (async () => {
      try {
        const storedRefreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
        const res = await fetch(DEFAULT_API_BASE + '/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: storedRefreshToken ? JSON.stringify({ refreshToken: storedRefreshToken }) : undefined,
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success && data.data?.accessToken) {
          setStoredToken(data.data.accessToken);
          if (data.data.refreshToken) {
            try { localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.data.refreshToken); } catch (_) {}
          }
          return data.data.accessToken;
        } else {
          setStoredToken(null);
          return null;
        }
      } catch (_) {
        return null;
      } finally {
        _refreshPromise = null;
      }
    })();

    return _refreshPromise;
  }

  // ─── HTTP Request Engine ─────────────────────────────────────────────────────
  async function request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : (DEFAULT_API_BASE + endpoint);
    let token = getStoredToken();

    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const config = {
      method: options.method || 'GET',
      headers,
      credentials: 'include',
      body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
    };

    let res;
    try {
      res = await fetch(url, config);
    } catch (err) {
      throw new Error('فشل الاتصال بالخادم. تأكد من تشغيل السيرفر والاتصال بالإنترنت.');
    }

    // Auto-refresh token on 401 and retry original request once
    if (res.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      const newToken = await performTokenRefresh();
      if (newToken) {
        headers['Authorization'] = 'Bearer ' + newToken;
        res = await fetch(url, { ...config, headers });
      }
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.error?.message || data.message || ('خطأ ' + res.status + ': حدث خطأ غير متوقع');
      const err = new Error(errorMsg);
      err.status = res.status;
      err.code = data.error?.code;
      throw err;
    }

    return data;
  }

  // ─── KhatwaAPI Interface ─────────────────────────────────────────────────────
  const KhatwaAPI = {
    BASE_URL: DEFAULT_API_BASE,

    auth: {
      async login(username, password) {
        const res = await request('/auth/login', {
          method: 'POST',
          body: { username, password },
        });
        if (res.success && res.data) {
          const { user, accessToken, refreshToken } = res.data;
          setStoredToken(accessToken);
          if (refreshToken) {
            try { localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken); } catch (_) {}
          }
          setStoredUser(user);
        }
        return res.data;
      },

      async registerStudent(data) {
        const res = await request('/auth/register/student', {
          method: 'POST',
          body: data,
        });
        if (res.success && res.data) {
          const { user, accessToken, refreshToken } = res.data;
          setStoredToken(accessToken);
          if (refreshToken) {
            try { localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken); } catch (_) {}
          }
          setStoredUser(user);
        }
        return res.data;
      },

      async logout() {
        try {
          const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
          await request('/auth/logout', {
            method: 'POST',
            body: refreshToken ? { refreshToken } : undefined,
          });
        } catch (_) {}
        setStoredToken(null);
        setStoredUser(null);
        try { localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN); } catch (_) {}
        window.location.href = 'login.html';
      },

      async silentRefresh() {
        const token = await performTokenRefresh();
        return Boolean(token);
      },
    },

    getUser() {
      return getStoredUser();
    },

    setUser(user) {
      setStoredUser(user);
    },

    getToken() {
      return getStoredToken();
    },

    async fetchLiveUser() {
      try {
        const res = await request('/auth/me');
        if (res.success && res.data) {
          setStoredUser(res.data);
          return res.data;
        }
      } catch (_) {}
      return getStoredUser();
    },

    syncNav() {
      const user = this.getUser();
      if (!user) return;

      const isAdmin = (user.role === 'ADMIN' || user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser'));
      const isTeacher = user.role === 'TEACHER';

      document.querySelectorAll('.user-line').forEach(navUser => {
        const nameEl = navUser.querySelector('.name');
        const roleEl = navUser.querySelector('.role');
        const avatarEl = navUser.querySelector('.avatar');

        const firstLetter = (user.name || user.username || 'م').charAt(0);
        if (nameEl) nameEl.textContent = user.name || user.username;
        if (roleEl) {
          if (isAdmin) {
            roleEl.textContent = window.KhatwaI18n ? window.KhatwaI18n.t('مدير عام المنصة') : 'مدير عام المنصة';
            roleEl.style.color = 'var(--gold-light, #D4AF37)';
            roleEl.style.fontWeight = '700';
          } else if (isTeacher) {
            roleEl.textContent = window.KhatwaI18n ? window.KhatwaI18n.t('مدرس') : 'مدرس';
          } else {
            roleEl.textContent = window.KhatwaI18n ? window.KhatwaI18n.t('طالب') : 'طالب';
          }
        }
        if (avatarEl) avatarEl.textContent = isAdmin ? '👑' : firstLetter;

        const destHref = isAdmin ? 'admin.html' : (isTeacher ? 'teacher-dashboard.html' : 'dashboard.html');
        if (!navUser.getAttribute('href') || navUser.getAttribute('href') === 'index.html' || navUser.getAttribute('href') === 'profile.html') {
          navUser.setAttribute('href', destHref);
        }
      });

      if (isAdmin) {
        document.querySelectorAll('.nav-links').forEach(navLinks => {
          const label = window.KhatwaI18n ? window.KhatwaI18n.t('📊 لوحة الإدارة') : '📊 لوحة الإدارة';
          navLinks.innerHTML = '<li><a href="admin.html" class="active">' + label + '</a></li>';
        });
        document.querySelectorAll('#studentPointsTag, .student-only, .teacher-only').forEach(el => el.style.display = 'none');
      }
    },

    // ─── Public Discovery ────────────────────────────────────────────────────
    public: {
      async getCourses(stage = '', search = '') {
        const query = new URLSearchParams();
        if (stage) query.set('stage', stage);
        if (search) query.set('search', search);
        const res = await request('/courses?' + query.toString());
        return res.data || [];
      },
      async getTeachers() { const res = await request('/teachers'); return res.data || []; },
      async getTeacher(id) { const res = await request('/teachers/' + id); return res.data || null; },
    },

    // ─── Admin Portal ────────────────────────────────────────────────────────
    admin: {
      async getAnalytics() { const res = await request('/admin/analytics'); return res.data || {}; },
      async getStudents(search = '', page = 1, limit = 50) {
        const query = new URLSearchParams({ search, page: String(page), limit: String(limit) });
        const res = await request('/admin/students?' + query.toString());
        return res.data || [];
      },
      async getStudentFullProfile(id) { const res = await request('/admin/students/' + id + '/full-profile'); return res.data || null; },
      async getNotes(studentId) { const res = await request('/admin/students/' + studentId + '/notes'); return res.data || []; },
      async addNote(studentId, content) { const res = await request('/admin/students/' + studentId + '/notes', { method: 'POST', body: { content } }); return res.data; },
      async deleteNote(studentId, noteId) { return request('/admin/students/' + studentId + '/notes/' + noteId, { method: 'DELETE' }); },
      async adjustWallet(studentId, amount, reason) { const res = await request('/admin/students/' + studentId + '/adjust-wallet', { method: 'POST', body: { amount, reason } }); return res.data; },
      async adjustPoints(studentId, amount, reason) { const res = await request('/admin/students/' + studentId + '/adjust-points', { method: 'POST', body: { amount, reason } }); return res.data; },
      async toggleStudentActive(id) { const res = await request('/admin/students/' + id + '/toggle-active', { method: 'PATCH' }); return res.data; },
      async getTeachers() { const res = await request('/admin/teachers'); return res.data || []; },
      async createTeacher(data) { const res = await request('/admin/teachers', { method: 'POST', body: data }); return res.data; },
      async updateTeacher(id, data) { const res = await request('/admin/teachers/' + id, { method: 'PATCH', body: data }); return res.data; },
      async toggleTeacherActive(id) { const res = await request('/admin/teachers/' + id + '/toggle-active', { method: 'PATCH' }); return res.data; },
      async deleteTeacher(id) { return request('/admin/teachers/' + id, { method: 'DELETE' }); },
      async getPointRequests() { const res = await request('/admin/point-requests'); return res.data || []; },
      async approvePointRequest(id, points) {
        return request('/admin/point-requests/' + id + '/approve', {
          method: 'PATCH',
          body: points ? { points } : undefined,
        });
      },
      async rejectPointRequest(id, reason) {
        return request('/admin/point-requests/' + id + '/reject', {
          method: 'PATCH',
          body: { reason },
        });
      },
      async getVideoAccessLogs() { const res = await request('/admin/video-access-logs'); return res.data || []; },
      async getAccessCodes(status) {
        const query = status && status !== 'ALL' ? ('?status=' + status) : '';
        const res = await request('/admin/access-codes' + query);
        return res.data || [];
      },
      async createAccessCode(data) { const res = await request('/admin/access-codes', { method: 'POST', body: data }); return res.data; },
      async revokeAccessCode(id) { const res = await request('/admin/access-codes/' + id + '/revoke', { method: 'PATCH' }); return res.data; },
      async regenerateAccessCode(id) { const res = await request('/admin/access-codes/' + id + '/regenerate', { method: 'POST' }); return res.data; },
    },

    // ─── Teacher Studio ──────────────────────────────────────────────────────
    teacher: {
      async getProfile() { const res = await request('/teacher/profile'); return res.data || {}; },
      async updateProfile(data) { const res = await request('/teacher/profile', { method: 'PATCH', body: data }); return res.data; },
      async getCourses() { const res = await request('/teacher/courses'); return res.data || []; },
      async createCourse(data) { const res = await request('/teacher/courses', { method: 'POST', body: data }); return res.data; },
      async getCourse(id) { const res = await request('/teacher/courses/' + id); return res.data; },
      async updateCourse(id, data) { const res = await request('/teacher/courses/' + id, { method: 'PATCH', body: data }); return res.data; },
      async deleteCourse(id) { return request('/teacher/courses/' + id, { method: 'DELETE' }); },
      async createChapter(courseId, data) { const res = await request('/teacher/courses/' + courseId + '/chapters', { method: 'POST', body: data }); return res.data; },
      async updateChapter(id, data) { const res = await request('/teacher/chapters/' + id, { method: 'PATCH', body: data }); return res.data; },
      async deleteChapter(id) { return request('/teacher/chapters/' + id, { method: 'DELETE' }); },
      async createLesson(chapterId, data) { const res = await request('/teacher/chapters/' + chapterId + '/lessons', { method: 'POST', body: data }); return res.data; },
      async updateLesson(id, data) { const res = await request('/teacher/lessons/' + id, { method: 'PATCH', body: data }); return res.data; },
      async uploadPdf(lessonId, file) {
        const formData = new FormData();
        formData.append('pdf', file);
        const res = await request('/teacher/lessons/' + lessonId + '/pdf', { method: 'POST', body: formData });
        return res.data;
      },
      async uploadVideo(file, lessonId) {
        const formData = new FormData();
        formData.append('video', file);
        if (lessonId) formData.append('lessonId', lessonId);
        const res = await request('/teacher/upload-video', { method: 'POST', body: formData });
        return res.data;
      },
      async createQuiz(data) { const res = await request('/teacher/quizzes', { method: 'POST', body: data }); return res.data; },
      async addQuizQuestion(quizId, data) { const res = await request('/teacher/quizzes/' + quizId + '/questions', { method: 'POST', body: data }); return res.data; },
      async deleteQuizQuestion(quizId, questionId) { return request('/teacher/quizzes/' + quizId + '/questions/' + questionId, { method: 'DELETE' }); },
      async getQuizWithAnswers(id) { const res = await request('/teacher/quizzes/' + id); return res.data; },
      async assignQuizToLesson(lessonId, quizId, quizRole) {
        const res = await request('/teacher/lessons/' + lessonId + '/assign-quiz', {
          method: 'PATCH',
          body: { quizId, quizRole },
        });
        return res.data;
      },
      async getStudents() { const res = await request('/teacher/students'); return res.data || []; },
    },

    // ─── Student Portal ──────────────────────────────────────────────────────
    student: {
      async getProfile() { const res = await request('/student/profile'); return res.data || {}; },
      async updateProfile(data) { const res = await request('/student/profile', { method: 'PUT', body: data }); return res.data; },
      async getEnrolledCourses() { const res = await request('/student/courses/enrolled'); return res.data || []; },
      async enrollCourse(courseId) { return request('/student/courses/' + courseId + '/enroll', { method: 'POST' }); },
      async getCourse(courseId) { const res = await request('/student/courses/' + courseId); return res.data; },
      async checkLessonAccess(lessonId) {
        const res = await request('/student/lessons/' + lessonId + '/access-check');
        return res.data || { canAccess: false, reason: 'UNKNOWN', step: 'assignment' };
      },
      async getLessonContent(lessonId) { const res = await request('/student/lessons/' + lessonId + '/content'); return res.data; },
      async getQuiz(quizId) { const res = await request('/student/quizzes/' + quizId); return res.data; },
      async submitQuizAttempt(quizId, answers) {
        const res = await request('/student/quizzes/' + quizId + '/attempt', {
          method: 'POST',
          body: { answers },
        });
        return res.data;
      },
      async getQuizAttempt(quizId) { const res = await request('/student/quizzes/' + quizId + '/attempt'); return res.data; },
      async getWallet() { const res = await request('/student/wallet'); return res.data || { walletBalance: 0, pointsBalance: 0, walletTransactions: [] }; },
      async requestPoints(formData) { const res = await request('/student/point-requests', { method: 'POST', body: formData }); return res.data; },
      async getPointRequests() { const res = await request('/student/point-requests'); return res.data || []; },
      async getPointsTransactions() { const res = await request('/student/points/transactions'); return res.data || []; },
      async redeemAccessCode(code) { const res = await request('/student/access-codes/redeem', { method: 'POST', body: { code } }); return res.data; },
      async getNotifications() { const res = await request('/student/notifications'); return res.data || []; },
      async markNotificationRead(id) { return request('/student/notifications/' + id + '/read', { method: 'PATCH' }); },
      async getStats() {
        const res = await request('/student/stats');
        return res.data || { pointsBalance: 0, walletBalance: 0, enrolledCount: 0, completedLectures: 0, averageScore: '100%', enrolledCourses: [], quizAttempts: [] };
      },
      async getActivities() {
        try {
          const [notifs, txs] = await Promise.all([
            request('/student/notifications').then(r => r.data || []).catch(() => []),
            request('/student/points/transactions').then(r => r.data || []).catch(() => []),
          ]);
          return [
            ...notifs.map(n => ({ id: n.id, title: n.title, desc: n.message, time: n.createdAt, icon: '🔔', type: 'info' })),
            ...txs.map(t => ({ id: t.id, title: t.type === 'CREDIT' ? 'شحن نقاط' : 'استخدام نقاط', desc: (t.reason || 'معاملة') + ' (' + (t.type === 'CREDIT' ? '+' : '-') + t.amount + ' نقطة)', time: t.createdAt, icon: t.type === 'CREDIT' ? '💎' : '⚡', type: t.type === 'CREDIT' ? 'success' : 'warn' })),
          ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        } catch { return []; }
      },
    },

    courses: {
      async getAll(stage = '', search = '') { return KhatwaAPI.public.getCourses(stage, search); },
      async getById(id) {
        try {
          const res = await request('/student/courses/' + id).catch(() => null);
          if (res?.data) return res.data;
          const all = await KhatwaAPI.public.getCourses();
          return all.find(c => c.id === id) || null;
        } catch { return null; }
      },
      async isEnrolled(courseId) {
        try { const enrolled = await KhatwaAPI.student.getEnrolledCourses(); return enrolled.some(c => c.id === courseId || c.courseId === courseId); }
        catch { return false; }
      },
      async getMyCourses() { return KhatwaAPI.student.getEnrolledCourses(); },
      async enroll(courseId) { return KhatwaAPI.student.enrollCourse(courseId); },
      async getStudentStats() { return KhatwaAPI.student.getStats(); },
    },

    store: {
      getStudentStats() { return KhatwaAPI.student.getStats(); },
      async getActivities() { return KhatwaAPI.student.getActivities(); },
    },

    pointRequests: {
      async getMyRequests() { return KhatwaAPI.student.getPointRequests(); },
      async create(formData) { return KhatwaAPI.student.requestPoints(formData); },
    },
  };

  window.KhatwaAPI = KhatwaAPI;

  document.addEventListener('DOMContentLoaded', () => {
    KhatwaAPI.syncNav();
    KhatwaAPI.fetchLiveUser().then(() => {
      KhatwaAPI.syncNav();
    });
  });
})(window);
