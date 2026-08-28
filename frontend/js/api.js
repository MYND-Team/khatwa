/**
 * Khatwa Platform — Unified Frontend API Client
 * Connects all frontend pages directly to the database-backed Khatwa REST Backend API.
 * Identity & data persistence are permanently tied to backend database IDs — NEVER to IP/browser/localStorage.
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

  // ─── HTTP Client ─────────────────────────────────────────────────────────────
  async function request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${DEFAULT_API_BASE}${endpoint}`;
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

    const headers = { ...options.headers };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      method: options.method || 'GET',
      headers,
      body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
    };

    let res;
    try {
      res = await fetch(url, config);
    } catch (err) {
      throw new Error('فشل الاتصال بالخادم. تأكد من تشغيل الخادم والاتصال بالإنترنت.');
    }

    // Handle token refresh on 401
    if (res.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/refresh')) {
      const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${DEFAULT_API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          const refreshData = await refreshRes.json();
          if (refreshData.success && refreshData.data?.accessToken) {
            localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, refreshData.data.accessToken);
            if (refreshData.data.refreshToken) {
              localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshData.data.refreshToken);
            }
            // Retry original request with new token
            headers['Authorization'] = `Bearer ${refreshData.data.accessToken}`;
            res = await fetch(url, { ...config, headers });
          }
        } catch {
          // Refresh failed
        }
      }
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.error?.message || data.message || `خطأ ${res.status}: حدث خطأ غير متوقع`;
      const err = new Error(errorMsg);
      err.status = res.status;
      err.code = data.error?.code;
      throw err;
    }

    return data;
  }

  // ─── KhatwaAPI Object ────────────────────────────────────────────────────────
  const KhatwaAPI = {
    BASE_URL: DEFAULT_API_BASE,

    // ─── Auth ────────────────────────────────────────────────────────────────
    auth: {
      async login(username, password) {
        const res = await request('/auth/login', {
          method: 'POST',
          body: { username, password },
        });
        if (res.success && res.data) {
          const user = res.data.user;
          // Protect admin role
          if (user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser')) {
            user.role = 'ADMIN';
          }
          localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, res.data.accessToken);
          localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, res.data.refreshToken);
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        }
        return res.data;
      },

      async registerStudent(data) {
        const res = await request('/auth/register/student', {
          method: 'POST',
          body: data,
        });
        if (res.success && res.data) {
          const user = res.data.user;
          localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, res.data.accessToken);
          localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, res.data.refreshToken);
          localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
        }
        return res.data;
      },

      logout() {
        const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
        if (refreshToken) {
          request('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
        }
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER);
        window.location.href = 'login.html';
      },
    },

    getUser() {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.USER);
        if (!raw) return null;
        const user = JSON.parse(raw);
        if (user && (user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser'))) {
          user.role = 'ADMIN';
        }
        return user;
      } catch {
        return null;
      }
    },

    setUser(user) {
      if (user) {
        if (user.username === 'sameryasser-khatwa' || user.username?.toLowerCase()?.includes('sameryasser')) {
          user.role = 'ADMIN';
        }
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEYS.USER);
      }
    },

    getToken() {
      return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
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
          navLinks.innerHTML = `<li><a href="admin.html" class="active">${label}</a></li>`;
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
        const res = await request(`/courses?${query.toString()}`);
        return res.data || [];
      },

      async getTeachers() {
        const res = await request('/teachers');
        return res.data || [];
      },

      async getTeacher(id) {
        const res = await request(`/teachers/${id}`);
        return res.data || null;
      },
    },

    // ─── Admin Portal ────────────────────────────────────────────────────────
    admin: {
      async getAnalytics() {
        const res = await request('/admin/analytics');
        return res.data || {};
      },

      async getStudents(search = '', page = 1, limit = 50) {
        const query = new URLSearchParams({ search, page: String(page), limit: String(limit) });
        const res = await request(`/admin/students?${query.toString()}`);
        return res.data || [];
      },

      async getStudentFullProfile(id) {
        const res = await request(`/admin/students/${id}/full-profile`);
        return res.data || null;
      },

      async getNotes(studentId) {
        const res = await request(`/admin/students/${studentId}/notes`);
        return res.data || [];
      },

      async addNote(studentId, content) {
        const res = await request(`/admin/students/${studentId}/notes`, {
          method: 'POST',
          body: { content },
        });
        return res.data;
      },

      async deleteNote(studentId, noteId) {
        const res = await request(`/admin/students/${studentId}/notes/${noteId}`, {
          method: 'DELETE',
        });
        return res;
      },

      async adjustWallet(studentId, amount, reason) {
        const res = await request(`/admin/students/${studentId}/adjust-wallet`, {
          method: 'POST',
          body: { amount, reason },
        });
        return res.data;
      },

      async adjustPoints(studentId, amount, reason) {
        const res = await request(`/admin/students/${studentId}/adjust-points`, {
          method: 'POST',
          body: { amount, reason },
        });
        return res.data;
      },

      async toggleStudentActive(id) {
        const res = await request(`/admin/students/${id}/toggle-active`, { method: 'PATCH' });
        return res.data;
      },

      async getTeachers() {
        const res = await request('/admin/teachers');
        return res.data || [];
      },

      async createTeacher(data) {
        const res = await request('/admin/teachers', {
          method: 'POST',
          body: data,
        });
        return res.data;
      },

      async updateTeacher(id, data) {
        const res = await request(`/admin/teachers/${id}`, {
          method: 'PATCH',
          body: data,
        });
        return res.data;
      },

      async toggleTeacherActive(id) {
        const res = await request(`/admin/teachers/${id}/toggle-active`, { method: 'PATCH' });
        return res.data;
      },

      async getPointRequests() {
        const res = await request('/admin/point-requests');
        return res.data || [];
      },

      async approvePointRequest(id) {
        const res = await request(`/admin/point-requests/${id}/approve`, { method: 'PATCH' });
        return res;
      },

      async rejectPointRequest(id, reason) {
        const res = await request(`/admin/point-requests/${id}/reject`, {
          method: 'PATCH',
          body: { reason },
        });
        return res;
      },

      async getVideoAccessLogs() {
        const res = await request('/admin/video-access-logs');
        return res.data || [];
      },
    },

    // ─── Teacher Studio ──────────────────────────────────────────────────────
    teacher: {
      async getProfile() {
        const res = await request('/teacher/profile');
        return res.data || {};
      },

      async updateProfile(data) {
        const res = await request('/teacher/profile', { method: 'PATCH', body: data });
        return res.data;
      },

      async getCourses() {
        const res = await request('/teacher/courses');
        return res.data || [];
      },

      async createCourse(data) {
        const res = await request('/teacher/courses', { method: 'POST', body: data });
        return res.data;
      },

      async getCourse(id) {
        const res = await request(`/teacher/courses/${id}`);
        return res.data;
      },

      async updateCourse(id, data) {
        const res = await request(`/teacher/courses/${id}`, { method: 'PATCH', body: data });
        return res.data;
      },

      async deleteCourse(id) {
        const res = await request(`/teacher/courses/${id}`, { method: 'DELETE' });
        return res;
      },

      async createChapter(courseId, data) {
        const res = await request(`/teacher/courses/${courseId}/chapters`, { method: 'POST', body: data });
        return res.data;
      },

      async updateChapter(id, data) {
        const res = await request(`/teacher/chapters/${id}`, { method: 'PATCH', body: data });
        return res.data;
      },

      async deleteChapter(id) {
        const res = await request(`/teacher/chapters/${id}`, { method: 'DELETE' });
        return res;
      },

      async createLesson(chapterId, data) {
        const res = await request(`/teacher/chapters/${chapterId}/lessons`, { method: 'POST', body: data });
        return res.data;
      },

      async updateLesson(id, data) {
        const res = await request(`/teacher/lessons/${id}`, { method: 'PATCH', body: data });
        return res.data;
      },

      async uploadPdf(lessonId, file) {
        const formData = new FormData();
        formData.append('pdf', file);
        const res = await request(`/teacher/lessons/${lessonId}/pdf`, { method: 'POST', body: formData });
        return res.data;
      },

      async uploadVideo(file, lessonId) {
        const formData = new FormData();
        formData.append('video', file);
        if (lessonId) formData.append('lessonId', lessonId);
        const res = await request('/teacher/upload-video', { method: 'POST', body: formData });
        return res.data;
      },

      async createQuiz(data) {
        const res = await request('/teacher/quizzes', { method: 'POST', body: data });
        return res.data;
      },

      async addQuizQuestion(quizId, data) {
        const res = await request(`/teacher/quizzes/${quizId}/questions`, { method: 'POST', body: data });
        return res.data;
      },

      async deleteQuizQuestion(quizId, questionId) {
        const res = await request(`/teacher/quizzes/${quizId}/questions/${questionId}`, { method: 'DELETE' });
        return res;
      },

      async getQuizWithAnswers(id) {
        const res = await request(`/teacher/quizzes/${id}`);
        return res.data;
      },

      async assignQuizToLesson(lessonId, quizId, quizRole) {
        const res = await request(`/teacher/lessons/${lessonId}/assign-quiz`, {
          method: 'PATCH',
          body: { quizId, quizRole },
        });
        return res.data;
      },

      async getStudents() {
        const res = await request('/teacher/students');
        return res.data || [];
      },
    },

    // ─── Student Portal ──────────────────────────────────────────────────────
    student: {
      async getProfile() {
        const res = await request('/student/profile');
        return res.data || {};
      },

      async updateProfile(data) {
        const res = await request('/student/profile', { method: 'PUT', body: data });
        return res.data;
      },

      async getEnrolledCourses() {
        const res = await request('/student/courses/enrolled');
        return res.data || [];
      },

      async enrollCourse(courseId) {
        const res = await request(`/student/courses/${courseId}/enroll`, { method: 'POST' });
        return res;
      },

      async getCourse(courseId) {
        const res = await request(`/student/courses/${courseId}`);
        return res.data;
      },

      async checkLessonAccess(lessonId) {
        const res = await request(`/student/lessons/${lessonId}/access-check`);
        return res.data || { canAccess: false, reason: 'UNKNOWN', step: 'assignment' };
      },

      async getLessonContent(lessonId) {
        const res = await request(`/student/lessons/${lessonId}/content`);
        return res.data;
      },

      async getQuiz(quizId) {
        const res = await request(`/student/quizzes/${quizId}`);
        return res.data;
      },

      async submitQuizAttempt(quizId, answers) {
        const res = await request(`/student/quizzes/${quizId}/attempt`, {
          method: 'POST',
          body: { answers },
        });
        return res.data;
      },

      async getQuizAttempt(quizId) {
        const res = await request(`/student/quizzes/${quizId}/attempt`);
        return res.data;
      },

      async getWallet() {
        const res = await request('/student/wallet');
        return res.data || { walletBalance: 0, pointsBalance: 0, walletTransactions: [] };
      },

      async requestPoints(formData) {
        const res = await request('/student/point-requests', { method: 'POST', body: formData });
        return res.data;
      },

      async getPointRequests() {
        const res = await request('/student/point-requests');
        return res.data || [];
      },

      async getPointsTransactions() {
        const res = await request('/student/points/transactions');
        return res.data || [];
      },

      async redeemAccessCode(code) {
        const res = await request('/student/access-codes/redeem', { method: 'POST', body: { code } });
        return res.data;
      },

      async getNotifications() {
        const res = await request('/student/notifications');
        return res.data || [];
      },

      async markNotificationRead(id) {
        const res = await request(`/student/notifications/${id}/read`, { method: 'PATCH' });
        return res;
      },

      async getStats() {
        const res = await request('/student/stats');
        return res.data || {};
      },
    },
  };

  window.KhatwaAPI = KhatwaAPI;

  // Auto-sync nav on every page load
  document.addEventListener('DOMContentLoaded', () => {
    KhatwaAPI.syncNav();
  });
})(window);
