/**
 * Math & Physics Equation Assistant for Khatwa Platform
 * Enables students to visually build and insert math/physics formulas (fractions, roots, powers, symbols)
 * Supports live KaTeX preview and handwritten solution image attachments.
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

  /**
   * Escape HTML utility
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Safe KaTeX render helper
   */
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
   * Ensure the single global Modal is injected into body
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
                <h3 style="margin:0;font-size:1.15rem;color:var(--primary, #0E4B5B);">محرر المعادلات والرموز الرياضية والفيزيائية</h3>
                <p style="margin:2px 0 0;font-size:0.8rem;color:var(--ink-dim, #64748B);">اختر الرموز أو استخدم القوالب لتركيب معادلتك بسهولة دون الحاجة لكتابة كود</p>
              </div>
            </div>
            <button type="button" class="khatwa-math-modal-close" id="khatwaMathCloseBtn" aria-label="إغلاق">&times;</button>
          </div>

          <!-- Body -->
          <div class="khatwa-math-modal-body">
            
            <!-- Category Tabs -->
            <div class="khatwa-math-tabs">
              <button type="button" class="math-tab-btn active" data-tab="builder">✨ منشئ القوالب السريع</button>
              <button type="button" class="math-tab-btn" data-tab="algebra">📐 الجبر والكسور والجذور</button>
              <button type="button" class="math-tab-btn" data-tab="physics">⚡ الفيزياء والرموز الإغريقية</button>
              <button type="button" class="math-tab-btn" data-tab="calculus">📈 حساب المثلثات والتفاضل</button>
            </div>

            <!-- Tab Content: Visual Builder -->
            <div id="tab-builder" class="math-tab-content active">
              <div class="math-builder-grid">
                
                <!-- Fraction Builder -->
                <div class="math-builder-card">
                  <div class="math-builder-card-title">➗ تركيب كسر (بسط / مقام)</div>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
                    <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
                      <input type="text" id="builderFracNum" class="form-control" placeholder="البسط (مثال: v - u)" style="font-size:0.85rem;padding:6px 10px;">
                      <div style="height:2px;background:var(--primary, #0E4B5B);border-radius:2px;"></div>
                      <input type="text" id="builderFracDen" class="form-control" placeholder="المقام (مثال: t)" style="font-size:0.85rem;padding:6px 10px;">
                    </div>
                    <button type="button" class="btn btn-sm btn-primary" id="applyFracBtn" style="height:fit-content;white-space:nowrap;">تطبيق الكسر ↵</button>
                  </div>
                </div>

                <!-- Root Builder -->
                <div class="math-builder-card">
                  <div class="math-builder-card-title">√ تركيب جذر</div>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
                    <input type="text" id="builderRootDeg" class="form-control" placeholder="رتبة الجذر (اختياري 3, n)" style="width:110px;font-size:0.82rem;padding:6px 10px;">
                    <input type="text" id="builderRootRad" class="form-control" placeholder="ما بداخل الجذر (مثال: b^2 - 4ac)" style="flex:1;font-size:0.85rem;padding:6px 10px;">
                    <button type="button" class="btn btn-sm btn-primary" id="applyRootBtn" style="height:fit-content;white-space:nowrap;">تطبيق الجذر ↵</button>
                  </div>
                </div>

                <!-- Power & Subscript Builder -->
                <div class="math-builder-card">
                  <div class="math-builder-card-title">xⁿ أس ودليل سفلي</div>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
                    <input type="text" id="builderBase" class="form-control" placeholder="الأساس (مثال: x أو v)" style="flex:1;font-size:0.85rem;padding:6px 10px;">
                    <input type="text" id="builderPower" class="form-control" placeholder="الأس (مثال: 2)" style="width:90px;font-size:0.85rem;padding:6px 10px;">
                    <input type="text" id="builderSub" class="form-control" placeholder="دليل سفلي (مثال: 1)" style="width:90px;font-size:0.85rem;padding:6px 10px;">
                    <button type="button" class="btn btn-sm btn-primary" id="applyPowerBtn" style="height:fit-content;white-space:nowrap;">تطبيق ↵</button>
                  </div>
                </div>

              </div>
            </div>

            <!-- Tab Content: Algebra -->
            <div id="tab-algebra" class="math-tab-content">
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

            <!-- Interactive Formula Editor Canvas -->
            <div class="khatwa-math-editor-box">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <label style="font-size:0.85rem;font-weight:700;color:var(--ink);">صيغة المعادلة الحالية (LaTeX):</label>
                <div style="display:flex;gap:6px;">
                  <button type="button" class="btn btn-line btn-xs" id="clearEquationBtn">🗑️ مسح الكل</button>
                  <button type="button" class="btn btn-line btn-xs" id="wrapParensBtn">( ) وضع بين أقواس</button>
                </div>
              </div>
              <input type="text" id="mathModalFormulaInput" class="form-control" placeholder="مثال: \\frac{1}{2} m v^2" style="direction:ltr;font-family:monospace;font-size:0.95rem;">
              
              <!-- Live Visual Preview of the Equation -->
              <div class="khatwa-math-preview-area">
                <div style="font-size:0.75rem;color:var(--ink-dim);margin-bottom:4px;">معاينة شكل المعادلة النهائي:</div>
                <div id="mathModalLivePreview" class="khatwa-math-rendered-target">$$ $$</div>
              </div>
            </div>

          </div>

          <!-- Footer -->
          <div class="khatwa-math-modal-footer">
            <div style="font-size:0.8rem;color:var(--ink-dim);display:flex;align-items:center;gap:6px;">
              <span>💡 يمكنك أيضاً تعديل الأرقام والرموز يدوياً في خانة الكود</span>
            </div>
            <div style="display:flex;gap:10px;">
              <button type="button" class="btn btn-line" id="khatwaMathCancelBtn">إلغاء</button>
              <button type="button" class="btn btn-primary" id="khatwaMathInsertBtn" style="padding:8px 22px;">إدراج المعادلة في الإجابة ✓</button>
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

  /**
   * Populate palette grids with clickable mathematical symbols
   */
  function populatePalettes() {
    function fillGrid(containerId, items) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = items.map(item => `
        <button type="button" class="math-palette-item" data-latex="${escapeHtml(item.latex)}" title="${escapeHtml(item.label)}">
          <span class="math-palette-render" data-katex="${escapeHtml(item.preview)}"></span>
          <span class="math-palette-lbl">${escapeHtml(item.label)}</span>
        </button>
      `).join('');

      // Render previews inside buttons
      el.querySelectorAll('.math-palette-render').forEach(span => {
        const tex = span.getAttribute('data-katex');
        renderKaTeX(span, tex, false);
      });

      // Click to append
      el.querySelectorAll('.math-palette-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const latex = btn.getAttribute('data-latex');
          appendToModalFormula(latex);
        });
      });
    }

    fillGrid('paletteAlgebra', SYMBOL_CATEGORIES.algebra);
    fillGrid('palettePhysics', SYMBOL_CATEGORIES.physics);
    fillGrid('paletteCalculus', SYMBOL_CATEGORIES.calculus);
  }

  /**
   * Setup modal event handlers
   */
  function setupModalEvents() {
    const modal = document.getElementById('khatwaMathModal');
    const closeBtn = document.getElementById('khatwaMathCloseBtn');
    const cancelBtn = document.getElementById('khatwaMathCancelBtn');
    const insertBtn = document.getElementById('khatwaMathInsertBtn');
    const formulaInput = document.getElementById('mathModalFormulaInput');
    const livePreview = document.getElementById('mathModalLivePreview');
    const clearBtn = document.getElementById('clearEquationBtn');
    const wrapBtn = document.getElementById('wrapParensBtn');

    // Close actions
    const closeModal = () => {
      modal.style.display = 'none';
      if (activeTargetInput) {
        activeTargetInput.focus();
      }
    };

    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Tab switching
    modal.querySelectorAll('.math-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.math-tab-btn').forEach(b => b.classList.remove('active'));
        modal.querySelectorAll('.math-tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = 'tab-' + btn.getAttribute('data-tab');
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');
      });
    });

    // Formula input change
    formulaInput?.addEventListener('input', () => {
      renderKaTeX(livePreview, formulaInput.value || '', true);
    });

    // Clear
    clearBtn?.addEventListener('click', () => {
      if (formulaInput) {
        formulaInput.value = '';
        renderKaTeX(livePreview, '', true);
        formulaInput.focus();
      }
    });

    // Wrap parens
    wrapBtn?.addEventListener('click', () => {
      if (formulaInput && formulaInput.value.trim()) {
        formulaInput.value = `\\left( ${formulaInput.value.trim()} \\right)`;
        renderKaTeX(livePreview, formulaInput.value, true);
      }
    });

    // Builder: Fraction
    document.getElementById('applyFracBtn')?.addEventListener('click', () => {
      const num = document.getElementById('builderFracNum')?.value.trim() || 'a';
      const den = document.getElementById('builderFracDen')?.value.trim() || 'b';
      appendToModalFormula(`\\frac{${num}}{${den}}`);
      document.getElementById('builderFracNum').value = '';
      document.getElementById('builderFracDen').value = '';
    });

    // Builder: Root
    document.getElementById('applyRootBtn')?.addEventListener('click', () => {
      const deg = document.getElementById('builderRootDeg')?.value.trim();
      const rad = document.getElementById('builderRootRad')?.value.trim() || 'x';
      if (deg) {
        appendToModalFormula(`\\sqrt[${deg}]{${rad}}`);
      } else {
        appendToModalFormula(`\\sqrt{${rad}}`);
      }
      document.getElementById('builderRootDeg').value = '';
      document.getElementById('builderRootRad').value = '';
    });

    // Builder: Power & Subscript
    document.getElementById('applyPowerBtn')?.addEventListener('click', () => {
      const base = document.getElementById('builderBase')?.value.trim() || 'x';
      const pwr = document.getElementById('builderPower')?.value.trim();
      const sub = document.getElementById('builderSub')?.value.trim();

      let formula = base;
      if (sub) formula += `_{${sub}}`;
      if (pwr) formula += `^{${pwr}}`;

      appendToModalFormula(formula);
      document.getElementById('builderBase').value = '';
      document.getElementById('builderPower').value = '';
      document.getElementById('builderSub').value = '';
    });

    // Insert into active textarea
    insertBtn?.addEventListener('click', () => {
      const formula = formulaInput?.value.trim();
      if (!formula) {
        closeModal();
        return;
      }

      const formattedLatex = ` $$${formula}$$ `;
      insertTextAtTarget(formattedLatex);
      closeModal();
    });
  }

  /**
   * Append latex fragment to modal formula input
   */
  function appendToModalFormula(latexSnippet) {
    const formulaInput = document.getElementById('mathModalFormulaInput');
    const livePreview = document.getElementById('mathModalLivePreview');
    if (!formulaInput) return;

    if (formulaInput.value && !formulaInput.value.endsWith(' ')) {
      formulaInput.value += ' ' + latexSnippet;
    } else {
      formulaInput.value += latexSnippet;
    }

    renderKaTeX(livePreview, formulaInput.value, true);
    formulaInput.focus();
  }

  /**
   * Insert text at cursor in active textarea
   */
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

    // Trigger input event to update live previews
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Open the equation modal for a specific textarea
   */
  function openEquationModal(targetInput) {
    ensureModalInjected();
    activeTargetInput = targetInput;
    activeCursorPos = {
      start: targetInput.selectionStart || 0,
      end: targetInput.selectionEnd || 0
    };

    const modal = document.getElementById('khatwaMathModal');
    const formulaInput = document.getElementById('mathModalFormulaInput');
    const livePreview = document.getElementById('mathModalLivePreview');

    if (formulaInput) formulaInput.value = '';
    if (livePreview) renderKaTeX(livePreview, '', true);

    if (modal) {
      modal.style.display = 'flex';
      setTimeout(() => {
        formulaInput?.focus();
      }, 100);
    }
  }

  /**
   * Initialize Math Assistant Toolbar for all math-enabled textareas inside a container
   */
  function initToolbars(rootElement) {
    ensureModalInjected();

    const root = rootElement || document;
    const inputs = root.querySelectorAll('.essay-answer-box, .math-enabled-input');

    inputs.forEach(input => {
      // Avoid duplicate initialization
      if (input.getAttribute('data-math-initialized') === 'true') return;
      input.setAttribute('data-math-initialized', 'true');

      // Wrap in a container if needed
      let wrapper = input.closest('.khatwa-math-answer-wrapper');
      if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'khatwa-math-answer-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
      }

      // 1. Create Top Toolbar
      const toolbar = document.createElement('div');
      toolbar.className = 'khatwa-math-toolbar';
      toolbar.innerHTML = `
        <div class="math-tb-left">
          <!-- Main Button matching Screenshot -->
          <button type="button" class="math-tb-btn math-tb-btn-primary" title="فتح نافذة كتابة المعادلات الرياضية والرموز">
            <span class="math-tb-badge">√x</span>
            <span>إدراج معادلة رياضية</span>
          </button>

          <span class="math-tb-sep"></span>

          <!-- Quick access fraction, root, powers -->
          <button type="button" class="math-tb-btn" data-insert="\\frac{a}{b}" title="إدراج كسر (بسط ومقام)">
            <span style="font-size:0.95rem;font-weight:700;">a/b</span>
          </button>
          <button type="button" class="math-tb-btn" data-insert="\\sqrt{x}" title="جذر تربيعي">
            <span>√x</span>
          </button>
          <button type="button" class="math-tb-btn" data-insert="x^{2}" title="أس تربيعي">
            <span>x²</span>
          </button>
          <button type="button" class="math-tb-btn" data-insert="x_{1}" title="دليل سفلي">
            <span>x₁</span>
          </button>

          <span class="math-tb-sep"></span>

          <!-- Quick common symbols -->
          <button type="button" class="math-tb-btn" data-insert="\\pm" title="موجب أو سالب">±</button>
          <button type="button" class="math-tb-btn" data-insert="\\pi" title="النسبة باي">π</button>
          <button type="button" class="math-tb-btn" data-insert="\\theta" title="الزاوية ثيتا">θ</button>
          <button type="button" class="math-tb-btn" data-insert="\\Delta" title="التغير دلتا">Δ</button>
          <button type="button" class="math-tb-btn" data-insert="\\times" title="علامة الضرب">×</button>
          <button type="button" class="math-tb-btn" data-insert="\\div" title="علامة القسمة">÷</button>
          <button type="button" class="math-tb-btn" data-insert="\\Omega" title="أوم (مقاومة كهربائية)">Ω</button>
          <button type="button" class="math-tb-btn" data-insert="\\lambda" title="طول موجي لامدا">λ</button>
        </div>

        <div class="math-tb-right">
          <!-- Photo Attachment Option -->
          <label class="math-tb-btn math-tb-photo-btn" title="التقاط أو إرفاق صورة لحلك بالخطوات في ورقة خارجية">
            <span>📷 إرفاق صورة الحل (ورقة)</span>
            <input type="file" accept="image/*" class="math-photo-file-input" style="display:none;">
          </label>
        </div>
      `;

      wrapper.insertBefore(toolbar, input);

      // 2. Create Live Preview Card below textarea
      const previewCard = document.createElement('div');
      previewCard.className = 'khatwa-math-live-preview-box';
      previewCard.style.display = 'none';
      previewCard.innerHTML = `
        <div class="khatwa-math-preview-header">
          <span>👁️ معاينة فورية لشكل الإجابة والمعادلات الرياضية:</span>
        </div>
        <div class="khatwa-math-preview-body"></div>
      `;

      // 3. Attachment Thumbnail Bar
      const attachBar = document.createElement('div');
      attachBar.className = 'khatwa-math-attachments-bar';
      attachBar.style.display = 'none';

      wrapper.appendChild(previewCard);
      wrapper.appendChild(attachBar);

      // Setup Live Preview Update
      const previewBody = previewCard.querySelector('.khatwa-math-preview-body');
      let previewDebounceTimer = null;

      const updatePreview = () => {
        const text = input.value.trim();
        if (!text) {
          previewCard.style.display = 'none';
          return;
        }

        previewCard.style.display = 'block';
        previewBody.innerHTML = escapeHtml(text);

        // Render math equations if KaTeX is present
        if (window.renderMathInElement) {
          try {
            window.renderMathInElement(previewBody, {
              delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false }
              ],
              throwOnError: false
            });
          } catch (_) {}
        }
      };

      input.addEventListener('input', () => {
        clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(updatePreview, 120);
      });

      // Toolbar Main Modal Button
      toolbar.querySelector('.math-tb-btn-primary')?.addEventListener('click', () => {
        openEquationModal(input);
      });

      // Toolbar Quick Insert Buttons
      toolbar.querySelectorAll('[data-insert]').forEach(btn => {
        btn.addEventListener('click', () => {
          activeTargetInput = input;
          const snippet = btn.getAttribute('data-insert');
          insertTextAtTarget(` $${snippet}$ `);
        });
      });

      // Photo Attachment File Input
      const fileInput = toolbar.querySelector('.math-photo-file-input');
      fileInput?.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 5 ميجابايت');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target.result;
          attachBar.style.display = 'flex';
          attachBar.innerHTML = `
            <div class="khatwa-math-attached-thumb">
              <img src="${base64}" alt="صورة حل الطالب">
              <div class="thumb-info">
                <span>📄 تم إرفاق صورة الحل الورقي (${escapeHtml(file.name)})</span>
                <button type="button" class="btn-remove-thumb" title="حذف الصورة">&times;</button>
              </div>
            </div>
          `;

          // Append to input text cleanly
          const imgMarker = `\n\n[صورة الحل المرفقة: ${file.name}]\n`;
          if (!input.value.includes(imgMarker.trim())) {
            input.value += imgMarker;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }

          // Attach data-img attribute to wrapper for submission handling
          wrapper.setAttribute('data-attached-image', base64);

          // Handle remove
          attachBar.querySelector('.btn-remove-thumb')?.addEventListener('click', () => {
            attachBar.style.display = 'none';
            attachBar.innerHTML = '';
            wrapper.removeAttribute('data-attached-image');
            input.value = input.value.replace(imgMarker, '').trim();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            fileInput.value = '';
          });
        };
        reader.readAsDataURL(file);
      });

      // Initial preview if has pre-filled value
      if (input.value.trim()) {
        updatePreview();
      }
    });
  }

  // Export to window
  window.KhatwaMath = {
    init: initToolbars,
    openModal: openEquationModal
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initToolbars());
  } else {
    setTimeout(() => initToolbars(), 150);
  }

})();
