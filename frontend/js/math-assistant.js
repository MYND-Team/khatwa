/**
 * Math & Physics Equation Assistant for Khatwa Platform
 * Features:
 * - Direct in-place Visual MathField (MathLive WYSIWYG): Students see real square roots (√), powers (xⁿ), and fractions (a/b) directly while typing, without any raw LaTeX.
 * - Framed Calculator Toolbar with structured key clusters (roots, powers, fractions, symbols, photo attachment).
 * - Full paper-solution image attachment with backend upload (/student/upload-answer-image) & safe lightbox viewer.
 * - Real-time sync with underlying form inputs for transparent quiz & homework submission.
 */

(function () {
  'use strict';

  let activeTargetInput = null;
  let activeCursorPos = { start: 0, end: 0 };
  let modalInitialized = false;

  const SYMBOL_CATEGORIES = {
    algebra: [
      { label: 'كسر عادي', latex: '\\frac{a}{b}', preview: '\\frac{a}{b}' },
      { label: 'كسر مركب', latex: '\\frac{x + y}{z - w}', preview: '\\frac{x + y}{z - w}' },
      { label: 'جذر تربيعي', latex: '\\sqrt{x}', preview: '\\sqrt{x}' },
      { label: 'جذر تكعيبي', latex: '\\sqrt[3]{x}', preview: '\\sqrt[3]{x}' },
      { label: 'جذر نوني', latex: '\\sqrt[n]{x}', preview: '\\sqrt[n]{x}' },
      { label: 'أس / قوى', latex: 'x^{2}', preview: 'x^{2}' },
      { label: 'دليل سفلي', latex: 'x_{1}', preview: 'x_{1}' },
      { label: 'أس ودليل معاً', latex: 'x_{1}^{2}', preview: 'x_{1}^{2}' },
      { label: 'أقواس دائرية', latex: '\\left( x + y \\right)', preview: '( x + y )' },
      { label: 'أقواس مربعة', latex: '\\left[ x \\right]', preview: '[ x ]' },
      { label: 'قيمة مطلقة', latex: '|x|', preview: '|x|' },
      { label: 'موجب أو سالب', latex: '\\pm', preview: '\\pm' },
      { label: 'ضرب', latex: '\\times', preview: '\\times' },
      { label: 'قسمة', latex: '\\div', preview: '\\div' },
      { label: 'يساوي تقريباً', latex: '\\approx', preview: '\\approx' },
      { label: 'لا يساوي', latex: '\\neq', preview: '\\neq' },
      { label: 'أصغر أو يساوي', latex: '\\le', preview: '\\le' },
      { label: 'أكبر أو يساوي', latex: '\\ge', preview: '\\ge' },
      { label: 'ما لا نهاية', latex: '\\infty', preview: '\\infty' }
    ],
    physics: [
      { label: 'الزاوية ثيتا', latex: '\\theta', preview: '\\theta' },
      { label: 'النسبة باي', latex: '\\pi', preview: '\\pi' },
      { label: 'التغير دلتا', latex: '\\Delta', preview: '\\Delta' },
      { label: 'المقاومة أوم', latex: '\\Omega', preview: '\\Omega' },
      { label: 'طول موجي لامدا', latex: '\\lambda', preview: '\\lambda' },
      { label: 'ميكرو / احتكاك', latex: '\\mu', preview: '\\mu' },
      { label: 'الكثافة رو', latex: '\\rho', preview: '\\rho' },
      { label: 'سرعة زاوية أوميجا', latex: '\\omega', preview: '\\omega' },
      { label: 'عزم الازدواج تاو', latex: '\\tau', preview: '\\tau' },
      { label: 'ألفا', latex: '\\alpha', preview: '\\alpha' },
      { label: 'بيتا', latex: '\\beta', preview: '\\beta' },
      { label: 'فاي', latex: '\\phi', preview: '\\phi' },
      { label: 'متجه السرعة', latex: '\\vec{v}', preview: '\\vec{v}' },
      { label: 'متجه القوة', latex: '\\vec{F}', preview: '\\vec{F}' },
      { label: 'أس 10 سالب', latex: '\\times 10^{-6}', preview: '\\times 10^{-6}' },
      { label: 'أس 10 موجب', latex: '\\times 10^{3}', preview: '\\times 10^{3}' },
      { label: 'متر / ثانية', latex: '\\text{ m/s}', preview: '\\text{m/s}' },
      { label: 'عجلة م/ث²', latex: '\\text{ m/s}^2', preview: '\\text{m/s}^2' },
      { label: 'نيوتن', latex: '\\text{ N}', preview: '\\text{N}' },
      { label: 'جول', latex: '\\text{ J}', preview: '\\text{J}' },
      { label: 'فولت', latex: '\\text{ V}', preview: '\\text{V}' }
    ],
    calculus: [
      { label: 'جا (sin)', latex: '\\sin(\\theta)', preview: '\\sin(\\theta)' },
      { label: 'جتا (cos)', latex: '\\cos(\\theta)', preview: '\\cos(\\theta)' },
      { label: 'ظا (tan)', latex: '\\tan(\\theta)', preview: '\\tan(\\theta)' },
      { label: 'مشتقة أولى', latex: '\\frac{dy}{dx}', preview: '\\frac{dy}{dx}' },
      { label: 'مشتقة ثانية', latex: '\\frac{d^2y}{dx^2}', preview: '\\frac{d^2y}{dx^2}' },
      { label: 'معدل التغير', latex: '\\frac{\\Delta y}{\\Delta x}', preview: '\\frac{\\Delta y}{\\Delta x}' },
      { label: 'تكامل غير محدد', latex: '\\int f(x) \\, dx', preview: '\\int f(x) dx' },
      { label: 'تكامل محدد', latex: '\\int_{a}^{b} f(x) \\, dx', preview: '\\int_{a}^{b} f(x) dx' },
      { label: 'المجموع سيجما', latex: '\\sum_{i=1}^{n} x_i', preview: '\\sum_{i=1}^{n} x_i' },
      { label: 'النهاية lim', latex: '\\lim_{x \\to 0}', preview: '\\lim_{x \\to 0}' }
    ]
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderKaTeX(element, latexStr, displayMode = false) {
    if (!element) return;
    if (window.katex) {
      try {
        window.katex.render(latexStr || '', element, {
          displayMode: displayMode,
          throwOnError: false
        });
      } catch (err) {
        element.textContent = latexStr;
      }
    } else if (window.renderMathInElement) {
      element.innerHTML = displayMode ? `$$${latexStr}$$` : `$${latexStr}$`;
      try {
        window.renderMathInElement(element, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
          ],
          throwOnError: false
        });
      } catch (_) {}
    } else {
      element.textContent = latexStr;
    }
  }

  /**
   * Inject Global Expanded Math Modal for full symbol palette
   */
  function ensureModalInjected() {
    if (modalInitialized || document.getElementById('khatwaMathModal')) return;

    const modalHtml = `
      <div id="khatwaMathModal" class="khatwa-math-modal-overlay" style="display:none;">
        <div class="khatwa-math-modal-dialog">
          
          <!-- Header -->
          <div class="khatwa-math-modal-header">
            <div class="khatwa-math-modal-title">
              <span class="math-icon-badge">√x</span>
              <div>
                <h3 style="margin:0;font-size:1.15rem;color:var(--primary, #0E4B5B);">محرر الرموز والمعادلات المتقدم</h3>
                <p style="margin:2px 0 0;font-size:0.8rem;color:var(--ink-dim, #64748B);">اختر الرموز المتقدمة لإدراجها مباشرة في لوحة المعادلة المرئية</p>
              </div>
            </div>
            <button type="button" class="khatwa-math-modal-close" id="khatwaMathCloseBtn" aria-label="إغلاق">&times;</button>
          </div>

          <!-- Body -->
          <div class="khatwa-math-modal-body">
            
            <!-- Visual Math Canvas in Modal -->
            <div class="khatwa-math-editor-box" style="margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
                <label style="font-size:0.92rem;font-weight:700;color:var(--primary, #0E4B5B);">
                  <span>📐 لوحة المعادلة (تظهر فيها الرموز الرياضية بشكل طبيعي):</span>
                </label>
                <div style="display:flex;gap:6px;">
                  <button type="button" class="btn btn-line btn-xs" id="clearEquationBtn">🗑️ مسح</button>
                  <button type="button" class="btn btn-line btn-xs" id="wrapParensBtn">( ) أقواس</button>
                </div>
              </div>

              <div class="khatwa-mathfield-wrapper" id="khatwaMathfieldWrapper">
                <math-field id="mathModalMathField" class="khatwa-visual-mathfield" style="width:100%;min-height:75px;font-size:1.4rem;padding:12px 16px;border:2px solid var(--primary, #0E4B5B);border-radius:12px;background:var(--bg-card, #ffffff);box-shadow:0 4px 16px rgba(0,0,0,0.06);direction:ltr;text-align:left;outline:none;display:block;"></math-field>
                <input type="text" id="mathModalFormulaInput" class="form-control" placeholder="صيغة المعادلة" style="direction:ltr;font-family:monospace;font-size:0.95rem;display:none;margin-top:8px;">
              </div>

              <div id="mathModalFallbackPreview" class="khatwa-math-preview-area" style="display:none;margin-top:10px;">
                <div style="font-size:0.75rem;color:var(--ink-dim);margin-bottom:4px;">معاينة KaTeX:</div>
                <div id="mathModalLivePreview" class="khatwa-math-rendered-target">$$ $$</div>
              </div>
            </div>

            <!-- Category Tabs -->
            <div class="khatwa-math-tabs">
              <button type="button" class="math-tab-btn active" data-tab="algebra">📐 الجبر والكسور والجذور</button>
              <button type="button" class="math-tab-btn" data-tab="physics">⚡ الفيزياء والرموز الإغريقية</button>
              <button type="button" class="math-tab-btn" data-tab="calculus">📈 حساب المثلثات والتفاضل</button>
            </div>

            <!-- Tab Content: Algebra -->
            <div id="tab-algebra" class="math-tab-content active">
              <div class="math-palette-grid" id="paletteAlgebra"></div>
            </div>

            <!-- Tab Content: Physics -->
            <div id="tab-physics" class="math-tab-content">
              <div class="math-palette-grid" id="palettePhysics"></div>
            </div>

            <!-- Tab Content: Calculus -->
            <div id="tab-calculus" class="math-tab-content">
              <div class="math-palette-grid" id="paletteCalculus"></div>
            </div>

          </div>

          <!-- Footer -->
          <div class="khatwa-math-modal-footer">
            <div style="font-size:0.82rem;color:var(--ink-dim);">
              <span>💡 اضغط على الرمز لإدراجه مباشرة في مكان المؤشر بالمعادلة</span>
            </div>
            <div style="display:flex;gap:10px;">
              <button type="button" class="btn btn-line" id="khatwaMathCancelBtn">إلغاء</button>
              <button type="button" class="btn btn-primary" id="khatwaMathInsertBtn" style="padding:10px 24px;font-weight:700;">تأكيد وإدراج المعادلة ✓</button>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    modalInitialized = true;

    setupModalEvents();
    populatePalettes();
  }

  function getMathField() {
    return document.getElementById('mathModalMathField');
  }

  function isMathLiveActive(el) {
    const target = el || getMathField();
    return target && typeof target.executeCommand === 'function';
  }

  function insertIntoVisualEditor(snippet, targetMf) {
    const mf = targetMf || getMathField();
    const formulaInput = document.getElementById('mathModalFormulaInput');

    if (isMathLiveActive(mf)) {
      try {
        mf.executeCommand(['insert', snippet]);
        mf.focus();
        if (formulaInput) formulaInput.value = mf.value;
        return;
      } catch (_) {}
    }

    if (formulaInput) {
      if (formulaInput.value && !formulaInput.value.endsWith(' ')) {
        formulaInput.value += ' ' + snippet;
      } else {
        formulaInput.value += snippet;
      }
      const livePreview = document.getElementById('mathModalLivePreview');
      if (livePreview) renderKaTeX(livePreview, formulaInput.value, true);
      formulaInput.focus();
    }
  }

  function populatePalettes() {
    function fillGrid(containerId, items) {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = items.map(item => `
        <button type="button" class="math-palette-item" data-latex="${escapeHtml(item.latex)}" title="${escapeHtml(item.label)}">
          <span class="math-palette-render" data-katex="${escapeHtml(item.preview)}"></span>
          <span class="math-palette-label">${escapeHtml(item.label)}</span>
        </button>
      `).join('');

      container.querySelectorAll('.math-palette-render').forEach(span => {
        const tex = span.getAttribute('data-katex');
        renderKaTeX(span, tex, false);
      });

      container.querySelectorAll('.math-palette-item').forEach(btn => {
        btn.addEventListener('click', () => {
          let latex = btn.getAttribute('data-latex') || '';
          if (latex === '\\sqrt{x}') latex = '\\sqrt{#0}';
          else if (latex === '\\sqrt[3]{x}') latex = '\\sqrt[3]{#0}';
          else if (latex === '\\frac{a}{b}') latex = '\\frac{#0}{#?}';
          else if (latex === 'x^{2}') latex = '^{2}';
          else if (latex === 'x_{1}') latex = '_{1}';

          insertIntoVisualEditor(latex);
        });
      });
    }

    fillGrid('paletteAlgebra', SYMBOL_CATEGORIES.algebra);
    fillGrid('palettePhysics', SYMBOL_CATEGORIES.physics);
    fillGrid('paletteCalculus', SYMBOL_CATEGORIES.calculus);
  }

  function setupModalEvents() {
    const modal = document.getElementById('khatwaMathModal');
    const closeBtn = document.getElementById('khatwaMathCloseBtn');
    const cancelBtn = document.getElementById('khatwaMathCancelBtn');
    const insertBtn = document.getElementById('khatwaMathInsertBtn');
    const clearBtn = document.getElementById('clearEquationBtn');
    const wrapBtn = document.getElementById('wrapParensBtn');
    const formulaInput = document.getElementById('mathModalFormulaInput');
    const livePreview = document.getElementById('mathModalLivePreview');
    const mf = getMathField();

    let modalActiveMfTarget = null;
    window._setModalTargetMf = (target) => {
      modalActiveMfTarget = target;
    };

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
      if (modalActiveMfTarget && typeof modalActiveMfTarget.focus === 'function') {
        modalActiveMfTarget.focus();
      } else if (activeTargetInput) {
        activeTargetInput.focus();
      }
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Tab switching
    modal?.querySelectorAll('.math-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.math-tab-btn').forEach(b => b.classList.remove('active'));
        modal.querySelectorAll('.math-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = 'tab-' + btn.getAttribute('data-tab');
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');
      });
    });

    // MathField events
    if (mf) {
      mf.addEventListener('input', () => {
        if (formulaInput) formulaInput.value = mf.value;
      });
    }

    // Clear
    clearBtn?.addEventListener('click', () => {
      if (isMathLiveActive(mf)) {
        mf.setValue('');
        mf.focus();
      }
      if (formulaInput) {
        formulaInput.value = '';
        renderKaTeX(livePreview, '', true);
      }
    });

    // Wrap in parentheses
    wrapBtn?.addEventListener('click', () => {
      if (isMathLiveActive(mf)) {
        const val = mf.value.trim();
        if (val) {
          mf.setValue(`\\left(${val}\\right)`);
          mf.focus();
        }
      } else if (formulaInput && formulaInput.value.trim()) {
        formulaInput.value = `\\left( ${formulaInput.value.trim()} \\right)`;
        renderKaTeX(livePreview, formulaInput.value, true);
      }
    });

    // Final Insert Button: Syncs modal value into the active field
    insertBtn?.addEventListener('click', () => {
      let formula = '';
      if (isMathLiveActive(mf)) {
        formula = (typeof mf.getValue === 'function' ? mf.getValue('latex-expanded') : mf.value) || '';
      }
      if (!formula && formulaInput) {
        formula = formulaInput.value.trim();
      }

      formula = (formula || '').trim();
      if (modalActiveMfTarget && isMathLiveActive(modalActiveMfTarget)) {
        if (formula) {
          modalActiveMfTarget.setValue(formula);
          modalActiveMfTarget.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (activeTargetInput) {
        if (formula) {
          insertTextAtTarget(` $$${formula}$$ `);
        }
      }

      closeModal();
    });
  }

  function insertTextAtTarget(snippet) {
    if (!activeTargetInput) return;

    const el = activeTargetInput;
    const val = el.value || '';
    const start = el.selectionStart ?? activeCursorPos.start ?? val.length;
    const end = el.selectionEnd ?? activeCursorPos.end ?? val.length;

    el.value = val.substring(0, start) + snippet + val.substring(end);
    const newCursor = start + snippet.length;
    el.selectionStart = newCursor;
    el.selectionEnd = newCursor;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openEquationModal(targetInput, initialSnippet, targetMf) {
    ensureModalInjected();
    activeTargetInput = targetInput;
    if (window._setModalTargetMf) {
      window._setModalTargetMf(targetMf || null);
    }
    activeCursorPos = {
      start: targetInput?.selectionStart || 0,
      end: targetInput?.selectionEnd || 0
    };

    const modal = document.getElementById('khatwaMathModal');
    const formulaInput = document.getElementById('mathModalFormulaInput');
    const mf = getMathField();

    if (modal) {
      modal.style.display = 'flex';
      setTimeout(() => {
        const currentVal = targetMf && typeof targetMf.getValue === 'function' ? targetMf.getValue() : (targetInput?.value || '');
        if (isMathLiveActive(mf)) {
          mf.setValue(currentVal || '');
          if (initialSnippet) {
            insertIntoVisualEditor(initialSnippet, mf);
          }
          mf.focus();
        } else if (formulaInput) {
          formulaInput.value = currentVal || '';
          if (initialSnippet) {
            formulaInput.value += initialSnippet.replace('#0', '').replace('#?', '');
          }
          formulaInput.focus();
        }
      }, 80);
    }
  }

  /**
   * Initialize Framed Toolbars and Direct Visual MathFields
   */
  function initToolbars(rootElement) {
    ensureModalInjected();

    const root = rootElement || document;
    const inputs = root.querySelectorAll('.essay-answer-box, .math-enabled-input');

    inputs.forEach(input => {
      if (input.getAttribute('data-math-initialized') === 'true') return;
      input.setAttribute('data-math-initialized', 'true');

      let wrapper = input.closest('.khatwa-math-answer-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'khatwa-math-answer-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
      }

      // Hide original raw textarea from student view (still acts as data carrier for form submission)
      input.style.display = 'none';

      // ─── 1. Build Framed Calculator Toolbar ────────────────────────────────
      const toolbar = document.createElement('div');
      toolbar.className = 'khatwa-math-toolbar-framed';
      toolbar.innerHTML = `
        <div class="khatwa-math-toolbar-header">
          <span>📐 أزرار وقوالب المعادلات الرياضية (كل زر يكتب الرمز مباشرة بالشكل الطبيعي):</span>
        </div>
        <div class="khatwa-math-toolbar">
          <!-- Frame 1: Core Templates (Roots, Powers, Fractions) -->
          <div class="math-frame-box" title="الجذور والأسس والكسور">
            <span class="math-frame-label">📐 القوالب</span>
            <div class="math-frame-keys">
              <button type="button" class="math-key-btn" data-insert="\\sqrt{#0}" title="جذر تربيعي (سكوير روت)">
                <span class="math-sym-icon">√⬚</span>
                <span class="math-key-text">جذر</span>
              </button>
              <button type="button" class="math-key-btn" data-insert="\\sqrt[3]{#0}" title="جذر تكعيبي">
                <span class="math-sym-icon">∛⬚</span>
                <span class="math-key-text">تكعيبي</span>
              </button>
              <button type="button" class="math-key-btn" data-insert="^{#0}" title="أس / قوى (باور)">
                <span class="math-sym-icon">xⁿ</span>
                <span class="math-key-text">أس</span>
              </button>
              <button type="button" class="math-key-btn" data-insert="^{2}" title="تربيع">
                <span class="math-sym-icon">x²</span>
                <span class="math-key-text">تربيع</span>
              </button>
              <button type="button" class="math-key-btn" data-insert="\\frac{#0}{#?}" title="كسر (بسط ومقام)">
                <span class="math-sym-icon">a/b</span>
                <span class="math-key-text">كسر</span>
              </button>
              <button type="button" class="math-key-btn" data-insert="_{#0}" title="دليل سفلي">
                <span class="math-sym-icon">x₁</span>
                <span class="math-key-text">دليل</span>
              </button>
              <button type="button" class="math-key-btn" data-insert="\\left(#0\\right)" title="أقواس">
                <span class="math-sym-icon">( )</span>
                <span class="math-key-text">أقواس</span>
              </button>
            </div>
          </div>

          <!-- Frame 2: Common Mathematical Symbols -->
          <div class="math-frame-box" title="العمليات والرموز">
            <span class="math-frame-label">🔢 الرموز</span>
            <div class="math-frame-keys">
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\pm" title="موجب أو سالب">±</button>
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\times" title="ضرب">×</button>
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\div" title="قسمة">÷</button>
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\pi" title="باي">π</button>
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\theta" title="ثيتا">θ</button>
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\Delta" title="دلتا">Δ</button>
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\Omega" title="أوم">Ω</button>
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\lambda" title="لامدا">λ</button>
              <button type="button" class="math-key-btn math-key-sm" data-insert="\\infty" title="ما لا نهاية">∞</button>
            </div>
          </div>

          <!-- Frame 3: Controls & Full Palette -->
          <div class="math-frame-box" title="إجراءات اللوحة">
            <span class="math-frame-label">⚙️ أدوات</span>
            <div class="math-frame-keys">
              <button type="button" class="math-key-btn btn-clear-canvas" title="مسح لوحة المعادلة">
                <span>🗑️ مسح</span>
              </button>
              <button type="button" class="math-key-btn btn-open-palette" title="فتح لوحة الرموز والفيزياء الكاملة">
                <span>✨ كافة الرموز</span>
              </button>
            </div>
          </div>

          <!-- Frame 4: Handwritten Paper Photo Attachment -->
          <div class="math-frame-box math-frame-photo" title="إرفاق صورة للحل بالخطوات في ورقة خارجية">
            <label class="math-key-btn math-tb-photo-btn" title="التقاط أو إرفاق صورة لحلك بالخطوات في ورقة خارجية">
              <span>📷 إرفاق ورقة الحل</span>
              <input type="file" accept="image/*" class="math-photo-file-input" style="display:none;">
            </label>
          </div>
        </div>
      `;

      // ─── 2. Build In-Place Visual MathField Box ────────────────────────────
      const mathBox = document.createElement('div');
      mathBox.className = 'khatwa-visual-math-box';
      mathBox.innerHTML = `
        <div class="khatwa-visual-math-header">
          <span>✍️ لوحة كتابة المعادلة المرئية (اكتب هنا مباشرة أو اضغط على أزرار القوالب أعلاه لتظهر الجذور والأسس والكسور بشكلها الطبيعي):</span>
        </div>
        <math-field class="khatwa-visual-mathfield"></math-field>
      `;

      // ─── 3. Build Optional Written Notes Box ────────────────────────────────
      const notesBox = document.createElement('div');
      notesBox.className = 'khatwa-written-notes-box';
      notesBox.innerHTML = `
        <div class="khatwa-written-notes-header">
          <span>📝 شرح أو خطوات إضافية بالكلمات (اختياري):</span>
        </div>
        <textarea class="khatwa-written-notes" placeholder="اكتب هنا أي شرح بالكلمات أو خطوات تفصيلية لحلك إذا أردت..." rows="2"></textarea>
      `;

      // ─── 4. Build Paper Solution Attachment Bar ────────────────────────────
      const attachBar = document.createElement('div');
      attachBar.className = 'khatwa-math-attachments-bar';
      attachBar.style.display = 'none';

      // Insert all UI elements into wrapper
      wrapper.appendChild(toolbar);
      wrapper.appendChild(mathBox);
      wrapper.appendChild(notesBox);
      wrapper.appendChild(attachBar);

      const mf = mathBox.querySelector('.khatwa-visual-mathfield');
      const notesTextarea = notesBox.querySelector('.khatwa-written-notes');

      // ─── Two-Way Data Synchronization ──────────────────────────────────────
      const syncToUnderlyingInput = () => {
        let latex = '';
        if (mf) {
          latex = (typeof mf.getValue === 'function' ? mf.getValue('latex-expanded') : mf.value) || '';
        }
        latex = (latex || '').trim();

        const notes = (notesTextarea ? notesTextarea.value : '').trim();
        const attachedImg = wrapper.getAttribute('data-attached-image') || '';

        let combined = '';
        if (notes) combined += notes;
        if (latex) {
          if (combined) combined += '\n\n';
          combined += `$$${latex}$$`;
        }
        if (attachedImg) {
          if (combined) combined += '\n\n';
          combined += `[صورة_الحل: ${attachedImg}]`;
        }

        input.value = combined;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };

      // Populate existing initial values if any
      const initialRaw = (input.value || '').trim();
      if (initialRaw) {
        // Extract attached image
        const imgMatch = initialRaw.match(/\[(?:صورة_الحل|صورة الحل المرفقة|صورة الحل):\s*([^\]]+)\]/i);
        if (imgMatch) {
          const imgUrl = imgMatch[1].trim();
          wrapper.setAttribute('data-attached-image', imgUrl);
          renderAttachBar(imgUrl, 'ورقة الحل');
        }

        // Extract math $$...$$
        let mathPart = '';
        const mathMatch = initialRaw.match(/\$\$([\s\S]+?)\$\$/);
        if (mathMatch) {
          mathPart = mathMatch[1].trim();
          if (mf && typeof mf.setValue === 'function') {
            mf.setValue(mathPart);
          }
        }

        // Clean notes part
        let notesPart = initialRaw
          .replace(/\[(?:صورة_الحل|صورة الحل المرفقة|صورة الحل):\s*[^\]]+\]/gi, '')
          .replace(/\$\$[\s\S]+?\$\$/g, '')
          .trim();

        if (notesTextarea && notesPart) {
          notesTextarea.value = notesPart;
        }
      }

      // MathField input listener
      if (mf) {
        mf.addEventListener('input', syncToUnderlyingInput);
      }

      // Notes textarea listener
      notesTextarea?.addEventListener('input', syncToUnderlyingInput);

      // ─── Toolbar Key Click Handlers ────────────────────────────────────────
      toolbar.querySelectorAll('[data-insert]').forEach(btn => {
        btn.addEventListener('click', () => {
          const snippet = btn.getAttribute('data-insert') || '';
          if (isMathLiveActive(mf)) {
            mf.executeCommand(['insert', snippet]);
            mf.focus();
            syncToUnderlyingInput();
          } else {
            // Fallback if MathLive not initialized yet
            if (notesTextarea) {
              notesTextarea.value += ' ' + snippet;
              notesTextarea.focus();
              syncToUnderlyingInput();
            }
          }
        });
      });

      // Clear button
      toolbar.querySelector('.btn-clear-canvas')?.addEventListener('click', () => {
        if (mf && typeof mf.setValue === 'function') {
          mf.setValue('');
          mf.focus();
        }
        syncToUnderlyingInput();
      });

      // Advanced Palette Modal button
      toolbar.querySelector('.btn-open-palette')?.addEventListener('click', () => {
        openEquationModal(input, null, mf);
      });

      // ─── Paper Photo Attachment Handler ────────────────────────────────────
      function renderAttachBar(imgSrc, fileName) {
        attachBar.style.display = 'flex';
        attachBar.innerHTML = `
          <div class="khatwa-math-attached-thumb" style="display:flex;align-items:center;gap:12px;background:var(--bg-card);border:1.5px solid var(--primary);border-radius:12px;padding:8px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.06);margin-top:6px;">
            <img src="${imgSrc}" alt="صورة حل الطالب" style="width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--line-soft);cursor:zoom-in;" onclick="window.open('${imgSrc}', '_blank')" title="اضغط لتكبير الصورة">
            <div class="thumb-info" style="flex:1;">
              <span style="font-size:0.86rem;font-weight:700;display:block;color:var(--ink);">📄 تم إرفاق صورة الحل الورقي (${escapeHtml(fileName || 'ورقة الإجابة')})</span>
              <div style="display:flex;gap:8px;margin-top:4px;">
                <button type="button" class="btn btn-line btn-xs btn-preview-thumb" onclick="window.open('${imgSrc}', '_blank')" style="font-size:0.75rem;padding:2px 8px;">🔍 تكبير</button>
                <button type="button" class="btn btn-line btn-xs btn-remove-thumb" style="font-size:0.75rem;padding:2px 8px;color:var(--err);">🗑️ حذف الصورة</button>
              </div>
            </div>
          </div>
        `;

        attachBar.querySelector('.btn-remove-thumb')?.addEventListener('click', () => {
          attachBar.style.display = 'none';
          attachBar.innerHTML = '';
          wrapper.removeAttribute('data-attached-image');
          syncToUnderlyingInput();
          const fi = toolbar.querySelector('.math-photo-file-input');
          if (fi) fi.value = '';
        });
      }

      const fileInput = toolbar.querySelector('.math-photo-file-input');
      fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
          alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 10 ميجابايت');
          return;
        }

        attachBar.style.display = 'flex';
        attachBar.innerHTML = `
          <div class="khatwa-math-attached-thumb uploading" style="padding:10px 14px;background:var(--bg-raised);border-radius:10px;border:1px dashed var(--primary);display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.4rem;">⏳</span>
            <div class="thumb-info" style="font-size:0.88rem;color:var(--primary);font-weight:700;">
              <span>جارٍ رفع وتثبيت صورة الحل (${escapeHtml(file.name)})...</span>
            </div>
          </div>
        `;

        const reader = new FileReader();
        reader.onload = async (event) => {
          const localBase64 = event.target.result;
          let serverImageUrl = null;

          try {
            if (window.KhatwaAPI?.student?.uploadAnswerImage) {
              const res = await window.KhatwaAPI.student.uploadAnswerImage(file);
              if (res && res.imageUrl) {
                serverImageUrl = res.imageUrl;
              }
            }
          } catch (uploadErr) {
            console.warn('Server upload failed, falling back to local base64:', uploadErr);
          }

          const effectiveImageSrc = serverImageUrl || localBase64;
          wrapper.setAttribute('data-attached-image', effectiveImageSrc);
          renderAttachBar(effectiveImageSrc, file.name);
          syncToUnderlyingInput();
        };
        reader.readAsDataURL(file);
      });
    });
  }

  window.KhatwaMath = {
    init: initToolbars,
    openModal: openEquationModal
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initToolbars());
  } else {
    setTimeout(() => initToolbars(), 120);
  }
})();
