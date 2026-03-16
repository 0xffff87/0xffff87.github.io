/**
 * 简历投递助手 - Content Script
 * 负责页面表单检测、与AI交互、智能填充各类表单控件
 * 支持原生表单元素和自定义 div 模拟的下拉框/选择器
 */

(function () {
  'use strict';

  if (window.__resumeHelperLoaded) return;
  window.__resumeHelperLoaded = true;

  // ========== 调试日志 ==========

  const debugLogs = [];

  function log(level, ...args) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
    debugLogs.push({ time, level, msg });
    const prefix = '[简历助手]';
    if (level === 'error') console.error(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else console.log(prefix, ...args);
  }

  function getDebugText() {
    return debugLogs.map(l => `[${l.time}][${l.level}] ${l.msg}`).join('\n');
  }

  // ========== UI组件 ==========

  let fab, panel;

  function createFAB() {
    fab = document.createElement('button');
    fab.id = 'resume-helper-fab';
    fab.title = '简历投递助手（可拖拽移动）';
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>
    `;

    // 支持拖拽移动悬浮按钮
    let isDragging = false;
    let dragStartX, dragStartY, fabStartX, fabStartY;

    fab.addEventListener('mousedown', (e) => {
      isDragging = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = fab.getBoundingClientRect();
      fabStartX = rect.left;
      fabStartY = rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (dragStartX == null) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        isDragging = true;
      }
      if (isDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - 52, fabStartX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - 52, fabStartY + dy));
        fab.style.left = newX + 'px';
        fab.style.top = newY + 'px';
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging && dragStartX != null) {
        togglePanel();
      }
      dragStartX = null;
      isDragging = false;
    });

    // 兼容程序化 .click() 调用（如测试脚本）
    fab.addEventListener('click', (e) => {
      if (!isDragging && dragStartX == null) togglePanel();
    });

    document.body.appendChild(fab);
  }

  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'resume-helper-panel';
    panel.innerHTML = `
      <div class="rh-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        简历投递助手
      </div>
      <div class="rh-body">
        <div class="rh-status" id="rh-status">
          <p>点击下方按钮开始智能填写当前页面的表单。</p>
          <p style="margin-top:8px;font-size:12px;color:#999;">支持原生输入框、下拉框以及自定义组件（如div模拟的选择器、日期选择器等）。</p>
        </div>
      </div>
      <div class="rh-actions">
        <button class="rh-btn rh-btn-secondary" id="rh-btn-close">关闭</button>
        <button class="rh-btn rh-btn-secondary" id="rh-btn-debug" style="color:#e67e22;">调试</button>
        <button class="rh-btn rh-btn-primary" id="rh-btn-fill">开始填写</button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('rh-btn-close').addEventListener('click', () => {
      panel.classList.remove('show');
    });

    document.getElementById('rh-btn-debug').addEventListener('click', () => {
      showDebugPanel();
    });

    document.getElementById('rh-btn-fill').addEventListener('click', () => {
      startFillProcess();
    });
  }

  function showDebugPanel() {
    let debugPanel = document.getElementById('rh-debug-panel');
    if (!debugPanel) {
      debugPanel = document.createElement('div');
      debugPanel.id = 'rh-debug-panel';
      debugPanel.style.cssText = `
        position:fixed; top:10%; left:10%; right:10%; bottom:10%;
        background:#1a1a2e; color:#e0e0e0; border-radius:12px;
        z-index:2147483647; display:flex; flex-direction:column;
        font-family:Consolas,"Courier New",monospace; font-size:12px;
        box-shadow:0 8px 40px rgba(0,0,0,0.4);
      `;
      debugPanel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:rgba(255,255,255,0.05); border-radius:12px 12px 0 0;">
          <span style="font-weight:bold; color:#667eea;">调试日志</span>
          <div>
            <button id="rh-debug-scan" style="background:#667eea; color:#fff; border:none; padding:4px 12px; border-radius:6px; cursor:pointer; margin-right:8px; font-size:12px;">扫描表单</button>
            <button id="rh-debug-copy" style="background:#555; color:#fff; border:none; padding:4px 12px; border-radius:6px; cursor:pointer; margin-right:8px; font-size:12px;">复制日志</button>
            <button id="rh-debug-close" style="background:#e74c3c; color:#fff; border:none; padding:4px 12px; border-radius:6px; cursor:pointer; font-size:12px;">关闭</button>
          </div>
        </div>
        <pre id="rh-debug-content" style="flex:1; overflow:auto; padding:12px 16px; margin:0; white-space:pre-wrap; word-break:break-all; line-height:1.6;"></pre>
      `;
      document.body.appendChild(debugPanel);

      document.getElementById('rh-debug-close').addEventListener('click', () => {
        debugPanel.style.display = 'none';
      });

      document.getElementById('rh-debug-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(getDebugText()).then(() => {
          alert('日志已复制到剪贴板');
        });
      });

      document.getElementById('rh-debug-scan').addEventListener('click', () => {
        debugLogs.length = 0;
        log('info', '=== 手动扫描表单开始 ===');
        const fields = scanFormFields();
        log('info', `共检测到 ${fields.length} 个表单字段：`);
        fields.forEach((f, i) => {
          const section = getSectionName(getFieldElement(f));
          log('info', `  [${i}] tag=${f.tag} type=${f.type} label="${f.label}" name="${f.name}" id="${f.id}" section="${section}" class="${(f.className || '').substring(0, 60)}" customType=${f.customType || '无'}`);
        });
        log('info', '=== 扫描完成 ===');
        refreshDebugContent();
      });
    }

    debugPanel.style.display = 'flex';
    refreshDebugContent();
  }

  function refreshDebugContent() {
    const el = document.getElementById('rh-debug-content');
    if (el) {
      el.textContent = debugLogs.length > 0 ? getDebugText() : '暂无日志。\n\n点击"扫描表单"可查看当前页面检测到的所有表单字段。\n点击"开始填写"后这里会显示详细的填写过程日志。';
      el.scrollTop = el.scrollHeight;
    }
  }

  function togglePanel() {
    if (!panel) createPanel();
    panel.classList.toggle('show');
  }

  function updateStatus(html) {
    const el = document.getElementById('rh-status');
    if (el) el.innerHTML = html;
  }

  function addStep(text, status = 'active') {
    const el = document.getElementById('rh-status');
    if (!el) return;
    const icon = status === 'done' ? '✓' : status === 'error' ? '✗' : '<span class="rh-spinner"></span>';
    el.innerHTML += `<div class="rh-step ${status}">${icon} ${text}</div>`;
  }

  function replaceLastStep(text, status) {
    const el = document.getElementById('rh-status');
    if (!el) return;
    const steps = el.querySelectorAll('.rh-step');
    if (steps.length > 0) {
      const last = steps[steps.length - 1];
      const icon = status === 'done' ? '✓' : status === 'error' ? '✗' : '<span class="rh-spinner"></span>';
      last.className = `rh-step ${status}`;
      last.innerHTML = `${icon} ${text}`;
    }
  }

  // ========== 表单检测 ==========

  function getLabelForElement(el) {
    // 对于容器类元素（非input/select/textarea），先查找内部的label子元素
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
      var innerLabel = el.querySelector(':scope > [class*="brick-field-label"], :scope > [class*="field-label"], :scope > label, :scope > .label');
      if (innerLabel) {
        var t = innerLabel.textContent.trim();
        if (t.length > 0 && t.length < 60) return t;
      }
      // 对于ant-select的placeholder span
      var phSpan = el.querySelector('.ant-select-selection-placeholder');
      if (phSpan) {
        var pt = phSpan.textContent.trim();
        if (pt.length > 0 && pt.length < 60) return pt;
      }
    }

    // aria-labelledby 优先
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean)
        .map(n => n.textContent.trim()).filter(Boolean);
      if (parts.length > 0) return parts.join(' / ');
    }

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) return label.textContent.trim();
    }

    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(c => c.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }

    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.placeholder) return el.placeholder;

    const prev = el.previousElementSibling;
    if (prev && ['LABEL', 'SPAN', 'DIV', 'P', 'H3', 'H4'].includes(prev.tagName)) {
      const text = prev.textContent.trim();
      if (text.length > 0 && text.length < 60) return text;
    }

    // 向上查找父级中的标签
    let ancestor = el.parentElement;
    for (let i = 0; i < 5 && ancestor; i++) {
      // 检查同层级前面的文本兄弟
      let sibling = ancestor.previousElementSibling;
      if (sibling) {
        const isLabel = sibling.tagName === 'LABEL' ||
          sibling.classList.contains('label') ||
          /label|title|name|header/i.test(sibling.className);
        if (isLabel) {
          const t = sibling.textContent.trim();
          if (t.length > 0 && t.length < 60) return t;
        }
      }

      // 在当前容器中搜索label元素
      const parent = ancestor;
      const lblEl = parent.querySelector(':scope > label, :scope > .label, :scope > [class*="label"], :scope > [class*="title"], :scope > legend, :scope > dt, :scope > th, :scope > span[class*="name"]');
      if (lblEl && !lblEl.contains(el)) {
        const t = lblEl.textContent.trim();
        if (t.length > 0 && t.length < 80) return t;
      }

      // 检查纯文本节点
      for (const child of parent.childNodes) {
        if (child.nodeType === 3) {
          const t = child.textContent.trim();
          if (t.length > 0 && t.length < 50) return t;
        }
      }

      ancestor = ancestor.parentElement;
    }

    if (el.title) return el.title;
    if (el.name) return el.name;

    return '';
  }

  function getSelectOptions(el) {
    if (el.tagName === 'SELECT') {
      return Array.from(el.options)
        .filter(opt => opt.value)
        .map(opt => ({ value: opt.value, text: opt.textContent.trim() }));
    }
    return [];
  }

  function isVisible(el) {
    if (!el.offsetParent && el.style.position !== 'fixed' && el.style.position !== 'absolute') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) < 0.1) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  // 检测自定义下拉/选择控件
  function scanCustomSelects() {
    const customs = [];
    // 搜索常见的自定义下拉选择器模式
    const selectors = [
      '[class*="select"][class*="down"]',
      '[class*="select"][class*="icon"]',
      '[class*="dropdown"][role]',
      '[class*="selector"]',
      '[class*="picker"]',
      '[role="combobox"]',
      '[role="listbox"]',
      'div[class*="select"]:not(select)',
      'span[class*="select"]:not(select)',
      'div[class*="ud__select"]',
      'div[class*="brick-select"]',
      'div[class*="ant-select"]',
      'div[class*="el-select"]',
      'div[class*="throne-biz-date-range-picker"]',
      'div[class*="brick-date-picker"]',
    ];

    const seen = new Set();

    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (!isVisible(el)) return;
          if (el.closest('#resume-helper-panel, #resume-helper-fab, #rh-debug-panel')) return;
          if (seen.has(el)) return;
          if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
          // 跳过纯图标/箭头元素（如下拉箭头 icon）
          if (['I', 'SVG', 'IMG'].includes(el.tagName)) return;
          if (el.tagName === 'SPAN' && /icon|caret|arrow/i.test(el.className)) return;
          // 跳过尺寸过小的元素（通常是图标）
          const rect = el.getBoundingClientRect();
          if (rect.width < 30 || rect.height < 20) return;
          seen.add(el);

          const label = getLabelForElement(el);
          const currentText = el.textContent.trim().substring(0, 100);

          customs.push({
            element: el,
            tag: el.tagName.toLowerCase(),
            type: 'custom-select',
            customType: 'dropdown',
            label: label,
            name: el.getAttribute('data-name') || '',
            id: el.id || '',
            placeholder: el.getAttribute('data-placeholder') || '',
            value: currentText,
            required: el.classList.contains('required') || /required/i.test(el.className),
            options: [],
            className: el.className || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            readOnly: false,
            context: '',
          });
        });
      } catch (e) { /* 忽略无效选择器 */ }
    });

    return customs;
  }

  // 检测input元素是否是下拉框触发器（非真正的文本输入框）
  function isDropdownTriggerInput(el) {
    const placeholder = (el.placeholder || '').trim();
    const label = getLabelForElement(el);

    // 优先检测：祖先/自身class含Select组件标识（即使placeholder含"请输入"也是下拉框）
    let ancestor = el.parentElement;
    for (let i = 0; i < 6 && ancestor; i++) {
      const cls = ancestor.className || '';
      if (/\bSelect\b|sd-Select|ud__select|brick-select|ant-select|el-select|select(?!All|or|ed|ion)/i.test(cls)) {
        const hasArrow = ancestor.querySelector('[class*="arrow"], [class*="caret"], [class*="suffix"]');
        if (hasArrow) return true;
        if (/\b\w*Select\w*\b/.test(cls) || /sd-Select/i.test(cls)) return true;
      }
      if (/dropdown|picker|throne-biz-date|brick-date/i.test(cls) && !/input/i.test(cls)) {
        return true;
      }
      ancestor = ancestor.parentElement;
    }

    // role="combobox"的祖先
    if (el.closest('[role="combobox"]')) return true;

    // 排除：label/placeholder含有"请输入"/"输入"等文字的是普通输入框
    const combined = placeholder + ' ' + label;
    if (/请输入|输入|请填写|搜索/.test(combined)) {
      return false;
    }

    // placeholder 或 label 是"请选择"等提示文本
    if (['请选择', '请选择...', '-- 请选择 --'].includes(placeholder) ||
        ['请选择', '请选择...'].includes(label)) {
      return true;
    }

    return false;
  }

  // 扫描所有表单字段（原生 + 自定义）
  function scanFormFields() {
    const fields = [];
    const elementRefs = [];

    // 1. 扫描原生表单元素
    const nativeSelectors = 'input, select, textarea, [contenteditable="true"], [role="textbox"]';
    const nativeElements = document.querySelectorAll(nativeSelectors);

    nativeElements.forEach((el) => {
      if (!isVisible(el)) return;
      if (el.closest('#resume-helper-panel, #resume-helper-fab, #rh-debug-panel')) return;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'file' || el.type === 'image' || el.type === 'reset') return;
      if (el.disabled) return;

      const field = {
        index: fields.length,
        tag: el.tagName.toLowerCase(),
        type: el.type || el.getAttribute('role') || 'text',
        customType: null,
        label: getLabelForElement(el),
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        value: el.value || el.textContent || '',
        required: el.required || el.getAttribute('aria-required') === 'true',
        options: getSelectOptions(el),
        className: el.className || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        readOnly: el.readOnly || false,
      };

      // 检测是否是下拉框触发器类型的input
      if (el.tagName === 'INPUT' && (el.type === 'text' || !el.type)) {
        if (isDropdownTriggerInput(el)) {
          field.customType = 'input-dropdown';
        }
      }

      const parent = el.closest('[class*="form"], [class*="field"], [class*="group"], [class*="item"], [class*="row"], [class*="wrapper"], [class*="control"], [class*="brick-field"], [class*="ud__form"]');
      if (parent) {
        const contextEl = parent.querySelector('[class*="label"], [class*="title"], [class*="name"], [class*="text"], [class*="brick-field-label"], legend, dt, th, label');
        if (contextEl && contextEl !== el) field.context = contextEl.textContent.trim().substring(0, 100);
      }

      fields.push(field);
      elementRefs.push(el);
    });

    // 2. 扫描自定义下拉控件
    const customFields = scanCustomSelects();
    customFields.forEach(cf => {
      // 避免与已扫描到的原生元素重复
      const alreadyInList = elementRefs.some(existing => {
        return existing === cf.element || existing.contains(cf.element) || cf.element.contains(existing);
      });
      if (alreadyInList) return;

      cf.index = fields.length;

      // 收集上下文
      const parent = cf.element.closest('[class*="form"], [class*="field"], [class*="group"], [class*="item"], [class*="row"], [class*="wrapper"], [class*="brick-field"], [class*="ud__form"]');
      if (parent) {
        const contextEl = parent.querySelector('[class*="label"], [class*="title"], [class*="brick-field-label"], legend, label');
        if (contextEl && contextEl !== cf.element) cf.context = contextEl.textContent.trim().substring(0, 100);
      }

      fields.push(cf);
      elementRefs.push(cf.element);
    });

    // 保存元素引用用于后续填充
    window.__rhElementRefs = elementRefs;

    return fields;
  }

  function getFieldElement(field) {
    if (window.__rhElementRefs && window.__rhElementRefs[field.index]) {
      const el = window.__rhElementRefs[field.index];
      if (!document.contains(el)) {
        log('warn', `字段[${field.index}] DOM元素已脱离文档`);
        return null;
      }
      return el;
    }
    log('warn', `字段[${field.index}] 未找到元素引用`);
    return null;
  }

  // ========== 表单填充 ==========

  function triggerInputEvents(el) {
    el.dispatchEvent(new Event('focus', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: el.value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));

    const reactEvent = new Event('input', { bubbles: true });
    Object.defineProperty(reactEvent, 'simulated', { value: true });
    el.dispatchEvent(reactEvent);

    const tracker = el._valueTracker;
    if (tracker) {
      tracker.setValue('');
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function setNativeValue(el, value) {
    try {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;

      const setter = el.tagName === 'TEXTAREA' ? nativeTextareaValueSetter : nativeInputValueSetter;

      if (setter) {
        setter.call(el, value);
      } else {
        el.value = value;
      }
    } catch (e) {
      el.value = value;
    }
    triggerInputEvents(el);
  }

  // 通过剪贴板粘贴输入值
  async function inputByClipboardPaste(el, value) {
    el.focus();
    await sleep(100);

    // 选中已有内容
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.select();
    } else {
      document.execCommand('selectAll', false, null);
    }
    await sleep(50);

    // 复制到剪贴板
    try {
      await navigator.clipboard.writeText(value);
    } catch (e) {
      log('warn', `剪贴板写入失败: ${e.message}，使用降级方案`);
      const tmp = document.createElement('textarea');
      tmp.value = value;
      tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      el.focus();
      if (el.select) el.select();
      await sleep(50);
    }

    // 模拟Ctrl+V触发粘贴
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'v', code: 'KeyV', keyCode: 86,
      ctrlKey: true, bubbles: true, cancelable: true
    }));

    const dt = new DataTransfer();
    dt.setData('text/plain', value);
    el.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: dt
    }));

    el.dispatchEvent(new KeyboardEvent('keyup', {
      key: 'v', code: 'KeyV', keyCode: 86,
      ctrlKey: true, bubbles: true
    }));
    await sleep(100);

    // 检查是否粘贴成功
    if (el.value === String(value)) return true;

    // 降级：execCommand insertText
    try {
      el.focus();
      if (el.select) el.select();
      document.execCommand('insertText', false, value);
      await sleep(50);
      if (el.value === String(value)) return true;
    } catch (e) {}

    // 降级：setNativeValue
    setNativeValue(el, value);
    return el.value === String(value);
  }

  function fillTextField(el, value) {
    if (!value) return false;
    el.focus();

    setNativeValue(el, value);

    if (el.value !== String(value)) {
      el.setAttribute('value', value);
      el.value = value;
      triggerInputEvents(el);
    }

    if (el.value !== String(value)) {
      try {
        el.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, value);
        triggerInputEvents(el);
      } catch (e) {}
    }

    el.classList.add('resume-helper-filled');
    const filled = el.value === String(value);
    if (!filled) {
      log('warn', `字段填充可能未生效: label="${el.placeholder || ''}" value="${value}" actual="${el.value}"`);
    }
    return true;
  }

  function fillSelectField(el, value) {
    if (!value) return false;
    const options = Array.from(el.options).filter(o => o.value);
    const match = findBestMatch(
      options.map(o => ({ textContent: o.textContent, _opt: o })),
      value
    );

    if (match) {
      const target = match._opt;
      el.focus();
      el.value = target.value;
      target.selected = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      triggerInputEvents(el);
      el.classList.add('resume-helper-filled');
      log('info', `  SELECT填充成功: "${value}" -> "${target.textContent.trim()}"`);
      return true;
    }

    log('warn', `  SELECT填充失败: 找不到匹配选项 "${value}"，可用: ${options.slice(0, 8).map(o => o.textContent.trim()).join(', ')}`);
    return false;
  }

  function fillDateField(el, value) {
    if (!value) return false;
    const dateStr = value.replace(/\//g, '-');
    el.focus();
    setNativeValue(el, dateStr);
    el.classList.add('resume-helper-filled');
    return true;
  }

  function fillRadioOrCheckbox(el, value) {
    if (!value) return false;
    const name = el.name;

    if (el.type === 'checkbox') {
      const shouldCheck = value === 'true' || value === '是' || value === 'yes' || value === '1' || value === true;
      el.checked = shouldCheck;
      triggerInputEvents(el);
      el.classList.add('resume-helper-filled');
      return true;
    }

    if (!name) return false;

    const group = document.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
    for (const radio of group) {
      const label = getLabelForElement(radio);
      if (radio.value === value || label === value ||
          label.includes(value) || value.includes(label)) {
        radio.checked = true;
        triggerInputEvents(radio);
        radio.classList.add('resume-helper-filled');
        log('info', `  RADIO填充成功: "${value}"`);
        return true;
      }
    }
    log('warn', `  RADIO填充失败: 找不到匹配项 "${value}"`);
    return false;
  }

  function fillContentEditable(el, value) {
    if (!value) return false;
    el.focus();
    el.textContent = value;
    triggerInputEvents(el);
    el.classList.add('resume-helper-filled');
    return true;
  }

  // 关闭所有打开的下拉框
  function closeAllDropdowns() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.click();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }

  // 选项搜索的所有选择器
  const OPTION_SELECTORS = [
    '[role="option"]',
    '.el-select-dropdown__item',
    '.ant-select-item',
    '.ant-select-item-option',
    '.ant-cascader-menu-item',
    '.kuma-select2-results li',
    '[class*="option"]:not([class*="options-"])',
    '[class*="dropdown"] li',
    '[class*="menu"] li',
    '[class*="select"] li',
    'ul[class*="drop"] li',
    'div[class*="pop"] [class*="item"]',
    'div[class*="overlay"] li',
  ];

  // 获取当前可见的选项元素快照（用于对比）
  function snapshotVisibleOptions() {
    const snapshot = new Set();
    OPTION_SELECTORS.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (isVisible(el) && !el.closest('#resume-helper-panel, #resume-helper-fab, #rh-debug-panel')) {
            snapshot.add(el);
          }
        });
      } catch (e) {}
    });
    return snapshot;
  }

  // 查找点击后新出现的选项元素
  function findNewOptions(preSnapshot) {
    const newOpts = [];
    const seen = new Set();
    OPTION_SELECTORS.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (seen.has(el) || preSnapshot.has(el)) return;
          if (!isVisible(el)) return;
          if (el.closest('#resume-helper-panel, #resume-helper-fab, #rh-debug-panel')) return;
          // 跳过纯容器元素（只包含子选项的外层）
          if (el.querySelector('[role="option"], [class*="option"]')) return;
          seen.add(el);
          newOpts.push(el);
        });
      } catch (e) {}
    });
    return newOpts;
  }

  // 在弹出层中搜索选项（降级方案）
  function findOptionsInPopups() {
    const popupSelectors = [
      '[class*="dropdown"]:not([style*="display: none"])',
      '[class*="popup"]:not([style*="display: none"])',
      '[class*="popover"]:not([style*="display: none"])',
      '[class*="overlay"]:not([style*="display: none"])',
      '[class*="drop"]:not([style*="display: none"])',
      '[class*="menu"]:not([style*="display: none"])',
    ];
    for (const pSel of popupSelectors) {
      try {
        const containers = document.querySelectorAll(pSel);
        for (const container of containers) {
          if (!isVisible(container)) continue;
          const items = container.querySelectorAll('li, [class*="item"], [class*="option"], [role="option"]');
          const visibleItems = Array.from(items).filter(item =>
            isVisible(item) && !item.querySelector('[role="option"], [class*="option"]')
          );
          if (visibleItems.length > 1) {
            return visibleItems;
          }
        }
      } catch (e) {}
    }
    return [];
  }

  // 模拟完整的鼠标点击序列（兼容各类框架）
  function simulateFullClick(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };

    el.dispatchEvent(new MouseEvent('mouseenter', { ...opts }));
    el.dispatchEvent(new MouseEvent('mouseover', { ...opts }));
    el.dispatchEvent(new MouseEvent('mousedown', { ...opts }));
    el.focus && el.focus();
    el.dispatchEvent(new MouseEvent('mouseup', { ...opts }));
    el.dispatchEvent(new MouseEvent('click', { ...opts }));
  }

  // 在选项列表中进行多级模糊匹配
  function findBestMatch(options, value) {
    if (!value || options.length === 0) return null;

    const valueTrim = value.trim();
    const valueLower = valueTrim.toLowerCase();
    const valueNorm = valueLower.replace(/[\s\-_\/()（）]/g, '');

    // 精确匹配
    let match = options.find(o => o.textContent.trim() === valueTrim);
    if (match) return match;

    // 忽略大小写匹配
    match = options.find(o => o.textContent.trim().toLowerCase() === valueLower);
    if (match) return match;

    // 包含匹配（选项包含目标值，或目标值包含选项）
    match = options.find(o => {
      const t = o.textContent.trim().toLowerCase();
      return t.length > 0 && (t.includes(valueLower) || valueLower.includes(t));
    });
    if (match) return match;

    // 归一化匹配（去除空格、标点等）
    match = options.find(o => {
      const t = o.textContent.trim().toLowerCase().replace(/[\s\-_\/()（）]/g, '');
      return t.length > 0 && (t.includes(valueNorm) || valueNorm.includes(t));
    });
    if (match) return match;

    // 常见别名映射
    const ALIASES = {
      '中国': ['中国大陆', '中国(大陆)', 'china', '中华人民共和国'],
      '中国大陆': ['中国', 'china', '中华人民共和国'],
      '男': ['男性', '男生', 'male'],
      '女': ['女性', '女生', 'female'],
      '本科': ['大学本科', '本科/学士', '学士'],
      '硕士': ['硕士研究生', '研究生/硕士'],
      '博士': ['博士研究生', '研究生/博士'],
      '大专': ['专科', '高职'],
      '否': ['不是', 'no', '不'],
      '是': ['yes', '是的'],
      '共青团员': ['团员', '中国共产主义青年团团员'],
      '中共党员': ['党员', '中国共产党党员'],
      '中共预备党员': ['预备党员'],
      '群众': ['无党派', '无党派人士'],
      '汉族': ['汉'],
    };
    const altList = ALIASES[valueTrim] || ALIASES[valueLower];
    if (altList) {
      match = options.find(o => {
        const t = o.textContent.trim().toLowerCase();
        return altList.some(a => t === a.toLowerCase() || t.includes(a.toLowerCase()) || a.toLowerCase().includes(t));
      });
      if (match) return match;
    }

    return null;
  }

  // 键盘模拟方案：focus → 清空 → 输入值 → 等待下拉 → 方向键选中 → 回车确认
  async function tryKeyboardSelect(el, value, preSnapshot) {
    const targetInput = el.tagName === 'INPUT' ? el : (el.querySelector('input') || el);
    targetInput.focus();
    await sleep(200);

    // 清空并输入值
    if (targetInput.tagName === 'INPUT') {
      setNativeValue(targetInput, '');
      await sleep(100);
      setNativeValue(targetInput, value);
      await sleep(600);
    }

    // 检查是否有匹配选项出现
    let options = findNewOptions(preSnapshot || new Set());
    if (options.length === 0) options = findOptionsInPopups();

    if (options.length > 0) {
      const match = findBestMatch(options, value);
      if (match) {
        // 尝试1：用方向键定位后回车
        const matchIndex = options.indexOf(match);
        for (let i = 0; i <= matchIndex; i++) {
          targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
          await sleep(50);
        }
        await sleep(100);
        targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        await sleep(300);

        el.classList.add('resume-helper-filled');
        log('info', `  键盘方案选中: "${value}" -> "${match.textContent.trim()}" (第${matchIndex + 1}项)`);
        closeAllDropdowns();
        await sleep(200);
        return true;
      } else {
        // 尝试2：直接按第一个方向键+回车（选择第一个搜索结果）
        targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
        await sleep(100);
        targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        await sleep(300);

        // 检查是否成功选择（元素文本变化）
        const newText = (el.textContent || el.value || '').trim();
        if (newText && newText !== '请选择' && newText !== value) {
          el.classList.add('resume-helper-filled');
          log('info', `  键盘方案选中首项: "${newText}"`);
          closeAllDropdowns();
          await sleep(200);
          return true;
        }
      }
    }

    closeAllDropdowns();
    await sleep(100);
    return false;
  }

  // 填充自定义下拉控件：快照对比法 + 多策略点击 + 键盘模拟
  async function fillCustomSelect(el, value) {
    if (!value) return false;

    log('info', `  尝试填充自定义下拉: "${value}"`);

    closeAllDropdowns();
    await sleep(300);

    // 步骤1：记录打开前的选项快照
    const preSnapshot = snapshotVisibleOptions();

    // 步骤2：滚动到元素并点击打开下拉框
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    await sleep(150);
    simulateFullClick(el);

    // 步骤3：等待下拉框出现并搜索选项（带重试）
    let optionElements = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(attempt === 0 ? 600 : 400);

      // 优先用快照差分找新出现的选项
      optionElements = findNewOptions(preSnapshot);
      if (optionElements.length > 1) {
        log('info', `  快照差分找到 ${optionElements.length} 个新选项 (第${attempt + 1}次)`);
        break;
      }

      // 降级：在弹出层中搜索
      optionElements = findOptionsInPopups();
      if (optionElements.length > 1) {
        log('info', `  弹出层搜索找到 ${optionElements.length} 个选项 (第${attempt + 1}次)`);
        break;
      }

      // 重试前再次点击
      if (attempt < 2) {
        log('info', `  第${attempt + 1}次未找到选项，重试点击...`);
        simulateFullClick(el);
      }
    }

    // kuma-select2 专用处理
    const isKumaSelect = (el.className || '').includes('kuma-select2') || !!el.closest('.kuma-select2-container');
    if (isKumaSelect) {
      log('info', `  检测到kuma-select2组件`);
      const kumaResults = document.querySelectorAll('.kuma-select2-results li');
      const visibleKuma = Array.from(kumaResults).filter(li => {
        const rect = li.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (visibleKuma.length > 0) optionElements = visibleKuma;

      // kuma搜索框
      if (optionElements.length === 0 || !findBestMatch(optionElements, value)) {
        const container = el.closest('.kuma-select2-container');
        const searchInput = container ? container.querySelector('.kuma-select2-search__field') : null;
        if (searchInput) {
          searchInput.focus();
          setNativeValue(searchInput, value);
          await sleep(1000);
          const afterSearch = Array.from(document.querySelectorAll('.kuma-select2-results li')).filter(li => {
            const rect = li.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (afterSearch.length > 0) optionElements = afterSearch;
        }
      }
    }

    log('info', `  最终候选选项数: ${optionElements.length}，前5项: ${optionElements.slice(0, 5).map(o => '"' + o.textContent.trim().substring(0, 20) + '"').join(', ')}`);

    // 步骤4：在选项中查找最佳匹配并点击
    if (optionElements.length > 0) {
      const match = findBestMatch(optionElements, value);
      if (match) {
        // 方案A：鼠标点击选项
        simulateFullClick(match);
        await sleep(200);

        if (match.getAttribute('aria-selected') === 'false') {
          match.setAttribute('aria-selected', 'true');
        }

        el.classList.add('resume-helper-filled');
        log('info', `  自定义下拉填充成功(点击): "${value}" -> "${match.textContent.trim()}"`);
        await sleep(300);
        closeAllDropdowns();
        await sleep(200);
        return true;
      } else {
        log('warn', `  自定义下拉未匹配: "${value}"，可用选项: ${optionElements.slice(0, 10).map(o => o.textContent.trim()).join(', ')}`);

        // 方案B：如果找到了选项但没有文本匹配到，尝试用键盘方向键遍历选项
        log('info', `  尝试键盘方案选择...`);
        closeAllDropdowns();
        await sleep(300);
        const kbResult = await tryKeyboardSelect(el, value, preSnapshot);
        if (kbResult) return true;
      }
    }

    // 步骤5：键盘方案——对input-dropdown类型，focus + 输入文本 + 方向键 + 回车
    if (el.tagName === 'INPUT') {
      log('info', `  尝试键盘输入方案: focus → 输入 → 方向键 → 回车`);
      closeAllDropdowns();
      await sleep(300);
      const kbResult = await tryKeyboardSelect(el, value, preSnapshot);
      if (kbResult) return true;
    }

    // 步骤5.5：div-dropdown包含内部input的情况
    if (el.tagName !== 'INPUT') {
      const input = el.querySelector('input');
      if (input) {
        setNativeValue(input, value);
        el.classList.add('resume-helper-filled');
        log('info', `  自定义下拉内的input直接填写: "${value}"`);
        closeAllDropdowns();
        await sleep(200);
        return true;
      }
    }

    // 步骤6：自动选择失败，等待用户手动选择（6秒）
    log('info', `  [等待用户] 请手动选择「${value}」（6秒后自动跳过）`);
    const oldText = el.textContent.trim();
    for (let i = 0; i < 12; i++) {
      await sleep(500);
      const newText = el.textContent.trim();
      if (newText && newText !== oldText && !['请选择', '请输入', '请填写'].some(s => newText.includes(s))) {
        log('info', `  [用户已选] "${newText}"`);
        el.classList.add('resume-helper-filled');
        closeAllDropdowns();
        await sleep(200);
        return true;
      }
    }

    closeAllDropdowns();
    await sleep(100);
    log('warn', `  自定义下拉填充失败: "${value}"`);
    return false;
  }

  // 下拉框简化填充：剪贴板粘贴输入值 → 等待筛选 → 回车确认
  async function fillDropdownByTyping(el, value) {
    if (!value) return false;
    const targetInput = el.tagName === 'INPUT' ? el : (el.querySelector('input') || el);

    const beforeValue = targetInput.value || '';
    const beforeText = (el.closest('[class*="Select"]') || el.parentElement || el).textContent || '';
    log('info', `  fillDropdownByTyping: 目标input=${targetInput.tagName} 填充前value="${beforeValue}" text="${beforeText.substring(0, 30)}"`);

    // 先按Escape关闭可能残留的上一个下拉菜单
    document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(200);

    targetInput.focus();
    await sleep(100);
    targetInput.click();
    await sleep(400);

    if (targetInput.tagName === 'INPUT' || targetInput.tagName === 'TEXTAREA') {
      targetInput.select();
      await sleep(50);
    }
    setNativeValue(targetInput, '');
    await sleep(200);

    setNativeValue(targetInput, value);
    log('info', `  setNativeValue后: value="${targetInput.value}"`);
    await sleep(500);

    if (targetInput.value !== String(value)) {
      log('info', `  setNativeValue未生效，尝试剪贴板粘贴`);
      targetInput.focus();
      await sleep(50);
      await inputByClipboardPaste(targetInput, value);
      log('info', `  剪贴板粘贴后: value="${targetInput.value}"`);
      await sleep(500);
    }

    await sleep(500);

    // 尝试点击匹配选项（三次重试，增加等待时间）
    let optionClicked = await tryClickMatchingOption(el, value);
    if (!optionClicked) {
      await sleep(500);
      optionClicked = await tryClickMatchingOption(el, value);
    }
    if (!optionClicked) {
      await sleep(800);
      optionClicked = await tryClickMatchingOption(el, value);
    }

    // 如果仍未找到选项，可能下拉菜单未打开：关闭→重新点击→重新粘贴→再搜索
    if (!optionClicked) {
      log('info', `  首轮搜索未找到选项，尝试重新打开下拉菜单`);
      targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(300);
      targetInput.focus();
      await sleep(100);
      targetInput.click();
      await sleep(500);
      if (targetInput.tagName === 'INPUT') {
        targetInput.select();
        await sleep(50);
      }
      setNativeValue(targetInput, '');
      await sleep(100);
      await inputByClipboardPaste(targetInput, value);
      await sleep(800);
      optionClicked = await tryClickMatchingOption(el, value);
      if (!optionClicked) {
        await sleep(500);
        optionClicked = await tryClickMatchingOption(el, value);
      }
    }

    if (optionClicked) {
      log('info', `  成功点击匹配选项`);
      await sleep(400);
    } else {
      log('info', `  DOM选项未找到，尝试键盘逐字符输入方式`);
      // 对于非INPUT元素（如brick-select的DIV），尝试找到内部的input
      var kbInput = targetInput;
      if (targetInput.tagName !== 'INPUT' && targetInput.tagName !== 'TEXTAREA') {
        var innerInput = targetInput.querySelector('input[type="text"], input[type="search"], input:not([type="hidden"])');
        if (innerInput) {
          kbInput = innerInput;
          log('info', `  找到内部input: ${innerInput.tagName} class=${(innerInput.className || '').substring(0, 30)}`);
        } else {
          log('info', `  非INPUT元素且无内部input，跳过键盘输入`);
          // 直接尝试点击下拉选项
          targetInput.click();
          await sleep(500);
          var lastTry = await tryClickMatchingOption(el, value);
          if (lastTry) {
            log('info', `  点击后成功找到选项`);
            await sleep(400);
          }
          var dv = targetInput.value || '';
          var dc = (el.closest('[class*="select"], [class*="Select"]') || el.parentElement || el).textContent || '';
          if (dc.includes(value) || dv.includes(value)) {
            el.classList.add('resume-helper-filled');
            log('info', `  下拉框填充成功: "${dv || dc.substring(0, 20)}"`);
            return true;
          }
          log('info', `  下拉框填充可能未成功`);
          return false;
        }
      }
      kbInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(200);
      kbInput.focus();
      await sleep(100);
      kbInput.click();
      await sleep(400);
      if (typeof kbInput.select === 'function') {
        kbInput.select();
      }
      await sleep(50);
      for (let i = 0; i < 20; i++) {
        kbInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true }));
      }
      await sleep(200);

      for (const ch of String(value)) {
        kbInput.dispatchEvent(new KeyboardEvent('keydown', { key: ch, code: `Key${ch.toUpperCase()}`, keyCode: ch.charCodeAt(0), bubbles: true }));
        kbInput.dispatchEvent(new KeyboardEvent('keypress', { key: ch, code: `Key${ch.toUpperCase()}`, keyCode: ch.charCodeAt(0), charCode: ch.charCodeAt(0), bubbles: true }));
        const ie = new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true, cancelable: true });
        kbInput.dispatchEvent(ie);
        kbInput.dispatchEvent(new KeyboardEvent('keyup', { key: ch, code: `Key${ch.toUpperCase()}`, keyCode: ch.charCodeAt(0), bubbles: true }));
        await sleep(80);
      }
      await sleep(600);

      optionClicked = await tryClickMatchingOption(el, value);
      if (optionClicked) {
        log('info', `  键盘输入后成功点击选项`);
        await sleep(400);
      } else {
        log('info', `  键盘输入后仍未找到选项，使用ArrowDown+Enter`);
        targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
        await sleep(150);
        targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        targetInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        await sleep(500);
      }
    }

    const afterValue = targetInput.value || '';
    const selectContainer = el.closest('[class*="Select"], [class*="select"], [class*="ud__select"], [class*="brick-select"], [class*="ant-select"], [class*="el-select"]') || el.parentElement || el;
    const afterText = selectContainer.textContent || '';
    const hasValueChanged = afterValue !== beforeValue && afterValue !== '' && afterValue !== '请选择';
    const hasTextChanged = afterText !== beforeText;
    const containsValue = afterText.includes(value) || afterValue.includes(value);

    log('info', `  验证: afterValue="${afterValue}" afterText="${afterText.substring(0, 40)}" valueChanged=${hasValueChanged} textChanged=${hasTextChanged} containsValue=${containsValue}`);

    if (containsValue || hasValueChanged || hasTextChanged) {
      el.classList.add('resume-helper-filled');
      log('info', `  下拉框填充成功: "${afterValue || afterText.substring(0, 20)}"`);
      return true;
    }

    log('info', `  下拉框填充可能未成功`);
    return false;
  }

  async function tryClickMatchingOption(el, value) {
    const inputEl = el.tagName === 'INPUT' ? el : (el.querySelector('input') || el);
    const inputLabel = inputEl.closest('label');
    const inputSelectContainer = inputEl.closest('[class*="Select"]');

    // 判断候选元素是否属于表单控件容器（非下拉选项）
    function isPartOfInputContainer(candidate) {
      if (candidate.contains(inputEl)) return true;
      if (inputEl.contains(candidate)) return true;
      if (inputLabel && inputLabel.contains(candidate)) return true;
      if (inputSelectContainer && inputSelectContainer === candidate) return true;
      // 排除任何包含input元素的容器（说明它是表单控件而非下拉选项）
      if (candidate.querySelector && candidate.querySelector('input')) return true;
      // 排除任何位于输入容器标签内的元素
      if (candidate.closest && candidate.closest('label[class*="Input-container"]')) return true;
      if (candidate.tagName === 'LABEL' && (candidate.className || '').includes('Input-container')) return true;
      return false;
    }

    const optionSelectors = [
      '[class*="option"]', '[class*="Option"]',
      '[class*="menu-item"]', '[class*="MenuItem"]',
      '[class*="dropdown-item"]', '[class*="DropdownItem"]',
      '[role="option"]', '[role="listbox"] > *',
      'li[class*="item"]', '.ant-select-item',
      '[class*="sd-Select"]', '[class*="sd-Dropdown"]',
      '[class*="select-option"]', '[class*="SelectOption"]',
      '[class*="ud__select__option"]', '[class*="brick-select-option"]',
      '.el-select-dropdown__item', '.el-scrollbar__view li',
      '.ant-select-item-option',
      '[class*="select-li"]',
      '[class*="Popup"] [class*="item"]', '[class*="Popup"] li',
      '[class*="popup"] [class*="item"]', '[class*="popup"] li',
      '[class*="menu"] li', '[class*="Menu"] li',
      '[class*="popper"] li', '[class*="Popper"] li',
      '[class*="overlay"] li', '[class*="Overlay"] li',
      '[class*="list"] li', '[class*="List"] li',
      '[class*="scroll"] li', '[class*="Scroll"] li',
      '[class*="virtual"] [class*="item"]',
    ];

    let exactMatch = null;
    let partialMatch = null;
    let allVisibleOptions = [];

    for (const selector of optionSelectors) {
      try {
        const options = document.querySelectorAll(selector);
        for (const opt of options) {
          if (!opt.offsetHeight || !opt.offsetWidth) continue;
          if (isPartOfInputContainer(opt)) continue;
          const optText = opt.textContent.trim();
          if (!optText) continue;
          if (allVisibleOptions.length < 30) {
            allVisibleOptions.push({ text: optText, selector });
          }
          if (optText === value) {
            exactMatch = opt;
            break;
          }
          if (!partialMatch && optText.includes(value)) {
            partialMatch = opt;
          }
        }
        if (exactMatch) break;
      } catch (e) {}
    }

    // body末尾弹出层搜索（更全面的元素类型）
    if (!exactMatch) {
      const bodyChildren = document.body.children;
      for (let i = bodyChildren.length - 1; i >= Math.max(0, bodyChildren.length - 15); i--) {
        const container = bodyChildren[i];
        if (!container.offsetHeight || container.id === 'resume-helper-fab' || container.id === 'resume-helper-panel' || container.id === 'rh-field-hint') continue;
        if (container.tagName === 'SCRIPT' || container.tagName === 'STYLE' || container.tagName === 'LINK') continue;
        const items = container.querySelectorAll('li, div[class*="item"], div[class*="option"], div[class*="Option"], div[class*="row"], span[class*="item"], span[class*="option"]');
        for (const item of items) {
          if (!item.offsetHeight || !item.offsetWidth) continue;
          if (isPartOfInputContainer(item)) continue;
          const text = item.textContent.trim();
          if (!text || text.length > 50) continue;
          if (allVisibleOptions.length < 30) {
            allVisibleOptions.push({ text, selector: 'body-tail' });
          }
          if (text === value) { exactMatch = item; break; }
          if (!partialMatch && text.includes(value)) partialMatch = item;
        }
        if (exactMatch) break;
      }
    }

    // 终极搜索：遍历所有带有高z-index或position:fixed/absolute的弹出层
    if (!exactMatch) {
      const allEls = document.querySelectorAll('div[style*="z-index"], div[style*="position: absolute"], div[style*="position: fixed"]');
      for (const popup of allEls) {
        if (!popup.offsetHeight || !popup.offsetWidth) continue;
        if (isPartOfInputContainer(popup)) continue;
        const rect = popup.getBoundingClientRect();
        if (rect.width < 30 || rect.height < 20) continue;
        const items = popup.querySelectorAll('li, div, span');
        for (const item of items) {
          if (!item.offsetHeight || !item.offsetWidth) continue;
          if (item.children.length > 3) continue;
          if (isPartOfInputContainer(item)) continue;
          const text = item.textContent.trim();
          if (!text || text.length > 30) continue;
          if (text === value) {
            exactMatch = item;
            if (allVisibleOptions.length < 30) allVisibleOptions.push({ text, selector: 'zindex-popup' });
            break;
          }
        }
        if (exactMatch) break;
      }
    }

    if (allVisibleOptions.length > 0 && allVisibleOptions.length <= 30) {
      log('info', `  可见选项(${allVisibleOptions.length}): ${allVisibleOptions.map(o => `"${o.text}"`).join(', ').substring(0, 200)}`);
    }

    // 找不到时输出body末尾DOM结构用于调试
    if (!exactMatch && !partialMatch) {
      const bodyChildren = document.body.children;
      const lastChildren = [];
      for (let i = bodyChildren.length - 1; i >= Math.max(0, bodyChildren.length - 8); i--) {
        const c = bodyChildren[i];
        lastChildren.push(`[${i}]${c.tagName}.${(c.className||'').substring(0,30)} vis=${c.offsetHeight>0} ch=${c.children.length} html=${(c.innerHTML||'').substring(0,80)}`);
      }
      log('info', `  DOM调试: body末尾: ${lastChildren.join(' | ').substring(0, 400)}`);
    }

    let target = exactMatch || partialMatch;

    // 如果匹配到的是容器元素（children较多），向下钻取到最深层的精确匹配子元素
    if (target && target.children.length > 0) {
      let deepest = target;
      let found = true;
      while (found) {
        found = false;
        for (const child of deepest.children) {
          if (!child.offsetHeight || !child.offsetWidth) continue;
          const childText = child.textContent.trim();
          if (childText === value) {
            deepest = child;
            found = true;
            break;
          }
        }
      }
      if (deepest !== target) {
        log('info', `  向下钻取: 从 ${target.tagName}.${(target.className||'').substring(0,25)} → ${deepest.tagName}.${(deepest.className||'').substring(0,25)}`);
        target = deepest;
      }
    }

    if (target) {
      const optText = target.textContent.trim();
      log('info', `  找到${exactMatch ? '精确' : '模糊'}匹配选项: "${optText}" tag=${target.tagName} class="${(target.className||'').substring(0,40)}"`);
      target.scrollIntoView({ block: 'nearest' });
      await sleep(50);
      target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await sleep(80);
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await sleep(30);
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      target.click();
      return true;
    }
    return false;
  }

  async function fillField(field, value) {
    const el = getFieldElement(field);
    if (!el) {
      log('error', `字段元素未找到: index=${field.index} label="${field.label}"`);
      return false;
    }
    if (!value) {
      log('warn', `跳过空值字段: label="${field.label}"`);
      return false;
    }

    log('info', `填充字段[${field.index}]: label="${field.label}" tag=${field.tag} type=${field.type} customType=${field.customType || '无'} class="${(field.className||'').substring(0,40)}" value="${String(value).substring(0, 60)}"`);

    try {
      if (field.customType === 'dropdown' || field.customType === 'input-dropdown') {
        return await fillCustomSelect(el, value);
      }

      switch (field.tag) {
        case 'select':
          return fillSelectField(el, value);
        case 'textarea':
          return fillTextField(el, value);
        case 'input':
          if (field.type === 'date' || field.type === 'month' || field.type === 'datetime-local') {
            return fillDateField(el, value);
          } else if (field.type === 'radio' || field.type === 'checkbox') {
            return fillRadioOrCheckbox(el, String(value));
          } else {
            return fillTextField(el, value);
          }
        default:
          if (el.getAttribute('contenteditable') === 'true' || field.type === 'textbox') {
            return fillContentEditable(el, value);
          }
          return fillTextField(el, value);
      }
    } catch (e) {
      log('error', `填充字段异常[${field.index}]: label="${field.label}" error=${e.message}`);
      return false;
    }
  }

  // ========== DOM信息提取（发送给后端） ==========

  function getSectionName(el) {
    const sectionSelectors = [
      'fieldset', '[class*="section"]', '[class*="block"]', '[class*="module"]',
      '[class*="card"]', '[class*="panel"]', '[class*="resume"]', '[class*="form-area"]',
      'h2', 'h3', '.form-section',
    ];
    let node = el;
    for (let i = 0; i < 10 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      for (const sel of sectionSelectors) {
        if (node.matches && node.matches(sel)) {
          const header = node.querySelector('h2, h3, h4, legend, [class*="title"], [class*="header"]');
          if (header) {
            const t = header.textContent.trim();
            if (t.length > 0 && t.length < 40) return t;
          }
        }
      }
    }
    return '';
  }

  function getNearbyText(el) {
    if (!el) return '';
    const texts = [];
    let prev = el.previousElementSibling;
    for (let i = 0; i < 3 && prev; i++) {
      const t = prev.textContent?.trim();
      if (t && t.length < 30 && t.length > 0) { texts.unshift(t); break; }
      prev = prev.previousElementSibling;
    }
    const parent = el.parentElement;
    if (parent) {
      const labelEl = parent.querySelector('label, [class*="label"], [class*="title"], [class*="key"], span:first-child');
      if (labelEl && labelEl !== el) {
        const lt = labelEl.textContent?.trim();
        if (lt && lt.length < 30 && lt.length > 0 && !texts.includes(lt)) texts.push(lt);
      }
    }
    const wrapper = el.closest('[class*="form-item"], [class*="field"], [class*="row"], [class*="group"]');
    if (wrapper) {
      const wLabel = wrapper.querySelector('[class*="label"], [class*="title"], legend');
      if (wLabel && wLabel !== el) {
        const wt = wLabel.textContent?.trim();
        if (wt && wt.length < 30 && wt.length > 0 && !texts.includes(wt)) texts.push(wt);
      }
    }
    return texts.join(' | ').substring(0, 60);
  }

  function getParentText(el) {
    if (!el) return '';
    const texts = [];
    let node = el;
    for (let depth = 0; depth < 5 && node; depth++) {
      node = node.parentElement;
      if (!node) break;
      const innerInputs = node.querySelectorAll('input, textarea, select, [role="textbox"]');
      if (innerInputs.length > 3) continue;
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          const t = child.textContent.trim();
          if (t.length > 0 && t.length < 40 && !texts.includes(t)) texts.push(t);
        }
      }
      const lblEls = node.querySelectorAll(':scope > label, :scope > span, :scope > div > label, :scope > [class*="label"]');
      for (const lbl of lblEls) {
        if (lbl.contains(el)) continue;
        const t = lbl.textContent.trim();
        if (t.length > 0 && t.length < 40 && !texts.includes(t)) texts.push(t);
      }
      if (texts.length >= 3) break;
    }
    return texts.join(' ').substring(0, 80);
  }

  function enrichFieldMetadata(fields) {
    return fields.map((f, i) => {
      const el = getFieldElement(f);
      const enriched = {
        tag: f.tag,
        type: f.type,
        customType: f.customType || null,
        label: f.label || '',
        name: f.name || '',
        id: (f.id && f.id.length < 30) ? f.id : '',
        placeholder: f.placeholder || '',
        value: (f.value || '').substring(0, 100),
        className: (f.className || '').substring(0, 80),
        ariaLabel: f.ariaLabel || '',
        readOnly: f.readOnly || false,
        options: (f.options || []).map(o => typeof o === 'object' ? o : { text: String(o) }).slice(0, 30),
      };
      if (f.context) enriched.context = f.context.substring(0, 60);
      if (el) {
        const section = getSectionName(el);
        if (section) enriched.section = section;
        const nearby = getNearbyText(el);
        if (nearby) enriched.nearby = nearby;
        const parentText = getParentText(el);
        if (parentText) enriched.parentText = parentText;
      }
      return enriched;
    });
  }

  // ========== 客户端规则匹配引擎（无需后端） ==========

  function clientRuleMatch(fieldsMeta, resumeData) {
    var logs = [];
    function addLog(level, msg) {
      var now = new Date();
      var t = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2) + ':' + ('0' + now.getSeconds()).slice(-2);
      logs.push({ time: t, level: level, msg: msg });
    }

    var basic = resumeData.basic || {};
    var eduList = resumeData.education || [];
    var edu = eduList[0] || {};
    var workList = resumeData.work || resumeData.experience || [];
    var work = workList[0] || {};
    var projList = resumeData.projects || [];
    var proj = projList[0] || {};

    var GENERIC_LABELS = {
      '联系信息': 1, '工作经验': 1, '学历': 1, '基础信息': 1, '教育经历': 1, '项目经验': 1,
      '补充信息': 1, '工作意向': 1, '教育经历-1': 1, '工作经历-1': 1,
      '请输入': 1, '请选择': 1, '请填写': 1, '开始日期': 1, '结束日期': 1
    };

    function testFieldAttr(field, labelRe, nameRe, classRe) {
      if (labelRe) {
        var attrs = ['label', 'placeholder', 'ariaLabel'];
        for (var a = 0; a < attrs.length; a++) {
          var val = field[attrs[a]] || '';
          if (val && labelRe.test(val)) return true;
        }
      }
      if (nameRe) {
        var attrs2 = ['name', 'id'];
        for (var b = 0; b < attrs2.length; b++) {
          var val2 = field[attrs2[b]] || '';
          if (val2 && nameRe.test(val2)) return true;
        }
      }
      if (classRe) {
        var cls = field.className || '';
        if (cls && classRe.test(cls)) return true;
      }
      return false;
    }

    function searchParentText(field, keywords) {
      if (!keywords || !keywords.length) return false;
      var ctx = (field.context || '') + ' ' + (field.nearby || '') + ' ' + (field.parentText || '');
      for (var k = 0; k < keywords.length; k++) {
        if (ctx.indexOf(keywords[k]) !== -1) return true;
      }
      return false;
    }

    function isDateRelatedField(field) {
      var cls = (field.className || '').toLowerCase();
      if (/required-year|required-month|year|month|date-?picker|calendar/.test(cls)) return true;
      var lbl = (field.label || '').trim();
      if (/^(年|月|开始时间|结束时间|起始时间|起止时间)$/.test(lbl)) return true;
      var ph = (field.placeholder || '').trim();
      if (/请选择.*时间|请选择.*日期|选择开始|选择结束/.test(ph)) return true;
      return false;
    }

    var langVal = resumeData.languages || basic.languages || null;
    var awardVal = (resumeData.awards && resumeData.awards[0]) ? resumeData.awards[0].name : null;
    var langLevelVal = resumeData.languageLevel || '熟练';
    var awardDateVal = (resumeData.awards && resumeData.awards[0]) ? resumeData.awards[0].date : null;
    var awardLevelVal = (resumeData.awards && resumeData.awards[0]) ? resumeData.awards[0].level : null;

    var rules = [
      { label_re: /^(?:姓名|真实姓名|请输入真实姓名|请输入姓名|名字)$/, name_re: /^(?:name|姓名)$/,
        parent_kw: ['姓名', '名字', '真实姓名'], value: basic.name, unique: true, key: 'name' },
      { label_re: /^(?:区号)$/, class_re: /telephone-region/, parent_kw: ['区号'], value: '+86', unique: true, key: 'areaCode' },
      { label_re: /(?:手机|电话|联系方式|手机号|请输入.*手机号)/, name_re: /^(?:phone|mobile|tel|cellphone|手机号码)$/, class_re: /telephone-input|phone-input/,
        parent_kw: ['手机', '电话', '联系方式', '手机号码'], value: basic.phone, unique: true, key: 'phone' },
      { label_re: /(?:邮箱|邮件|电子邮箱|请.*邮箱)/, name_re: /^(?:e-?mail|email|邮箱)$/, class_re: /e-?mail-input/,
        parent_kw: ['邮箱', '邮件', '电子邮箱'], value: basic.email, unique: true, key: 'email' },
      { label_re: /^(?:性别)$/, name_re: /^(?:gender|sex)$/,
        parent_kw: ['性别'], value: basic.gender, unique: true, key: 'gender' },
      { label_re: /(?:工作经验|工作年限)/, parent_kw: ['工作经验', '工作年限'],
        value: basic.workExperience || '无工作经验', unique: true, key: 'workExperience', only_select: true },
      { label_re: /(?:出生|生日|birthday)/, name_re: /(?:birth)/,
        parent_kw: ['出生', '生日'], value: basic.birthday, unique: true, key: 'birthday' },
      { label_re: /^(?:身份证|证件类型)$/, parent_kw: ['证件类型', '证件名称'],
        value: '身份证', unique: true, key: 'certType', only_select: true },
      { label_re: /(?:证件号码|身份证号|个人证件)/, name_re: /(?:cardnum|idcard|idnumber|个人证件|identification)/,
        parent_kw: ['证件号码', '身份证号', '个人证件'], value: basic.idCard || basic.idNumber || basic.idcard, unique: true, key: 'idNumber', skip_dropdown: true },
      { label_re: /(?:政治面貌)/, parent_kw: ['政治面貌', '面貌'], value: basic.politicalStatus || basic.political, unique: true, key: 'political' },
      { label_re: /(?:民族|族别)/, parent_kw: ['民族'], value: basic.ethnicity, unique: true, key: 'ethnicity' },
      { label_re: /(?:籍贯|户口)/, parent_kw: ['籍贯', '户口'], value: basic.hometown, unique: true, key: 'hometown' },
      { label_re: /(?:通信地址|住址|通讯地址|地址|详细住址)/, name_re: /^(?:address)$/i, parent_kw: ['通信地址', '地址', '住址', '详细住址'], value: basic.address, unique: true, key: 'address' },
      { label_re: /(?:选择国家|当前居住国家|居住国家|当前所在国家|所在国家)/, name_re: /^(?:currentCountry)$/i, class_re: /country-input(?!.*expectWork)/,
        parent_kw: ['当前居住国家', '居住国家', '当前所在国家', '所在国家'], value: basic.currentCountry || '中国', unique: true, key: 'currentCountry' },
      { label_re: /(?:现居住|所在地|当前城市|居住城市|省\/市|当前所在城市|所在城市)/, name_re: /^(?:currentCity)$/i, parent_kw: ['现居住', '所在地', '当前城市', '当前居住省/市', '居住省/市', '当前所在城市', '所在城市'],
        value: basic.currentCity, unique: true, key: 'currentCity' },
      { label_re: /(?:最近公司|最近工作)/, parent_kw: ['最近公司'],
        value: work.company, unique: true, key: 'recentCompany', skip_date: true },
      { label_re: /(?:期望工作国家|请选择国家)/, class_re: /expectWorkCountry/,
        parent_kw: ['期望工作国家'], value: '中国大陆', unique: true, key: 'expectCountry' },
      { label_re: /(?:意向.*城市|意愿.*城市|意向.*地点|目标.*城市|期望.*城市|期望.*地点)/, name_re: /^(?:preferred_city_list)$/,
        parent_kw: ['意向工作城市', '意愿城市', '意向地点', '期望工作城市', '期望城市', '期望工作地点'], value: basic.targetCity, unique: true, key: 'targetCity' },
      { label_re: /(?:当前薪资|目前薪资|现在薪资)/, parent_kw: ['当前薪资', '目前薪资'],
        value: basic.expectedSalary, unique: true, key: 'currentSalary' },
      { label_re: /(?:期望.*薪|年薪|月薪|期望薪资)/, parent_kw: ['期望年薪', '年薪', '月薪', '期望薪资'],
        value: basic.expectedSalary, unique: true, key: 'expectedSalary' },
      { label_re: /(?:自我评价|自我介绍|自我描述|补充信息|简介|介绍自己)/, parent_kw: ['自我评价', '自我介绍', '自我描述', '补充信息', '介绍自己'],
        value: basic.summary || resumeData.summary, unique: true, key: 'summary' },
      { label_re: /(?:微信号|微信)/, parent_kw: ['微信号', '微信'], value: basic.wechat, unique: true, key: 'wechat' },
      { label_re: /^(?:学校|学校名称|请输入就读学校)$/, name_re: /^(?:school|学校名称)$/, class_re: /school-input/,
        parent_kw: ['学校名称', '学校'], value: edu.school, unique: false, key: 'school', skip_date: true },
      { label_re: /^(?:专业|专业名称|请输入专业名称)$/, name_re: /^(?:major|field_of_study|专业)$/,
        parent_kw: ['专业名称', '专业'], value: edu.major, unique: false, key: 'major', skip_date: true },
      { label_re: /^(?:学历|最高学历)$/, name_re: /^(?:degree|education)$/, class_re: /education-required|degree/,
        parent_kw: ['学历', '最高学历'], value: edu.degree, unique: false, key: 'degree', skip_date: true, only_select: true },
      { label_re: /^(?:公司名称|企业名称)$/, name_re: /^(?:company|companyName?\d*|公司名称)$/,
        parent_kw: ['公司名称', '企业名称'], value: work.company, unique: false, key: 'company', skip_date: true },
      { label_re: /^(?:所在部门|部门名称)$/, name_re: /^(?:department\d*|实习部门)$/,
        parent_kw: ['实习部门', '部门', '工作部门', '所在部门'], value: work.department, unique: false, key: 'department', skip_date: true },
      { label_re: /^(?:工作职位|岗位名称|职位名称)$/, name_re: /^(?:positionName\d*|work|title|职位名称)$/,
        parent_kw: ['岗位名称', '工作岗位', '岗位', '职位名称', '工作职位'], value: work.position || work.title, unique: false, key: 'position', skip_date: true },
      { label_re: /^(?:工作描述|描述|工作内容)$/, name_re: /^(?:workDesc\d*|desc)$/, class_re: /describe-input/,
        parent_kw: ['工作职责', '实习工作内容', '实习内容', '工作内容', '工作描述'], value: work.description, unique: false, key: 'workDesc', skip_date: true },
      { label_re: /^(?:项目名称)$/, name_re: /^(?:subjectName\d*|项目名称)$/,
        parent_kw: ['项目名称'], value: proj.name, unique: false, key: 'projectName', skip_date: true },
      { label_re: /^(?:职责|项目角色)$/, name_re: /^(?:position\d+|项目角色)$/,
        parent_kw: ['项目角色', '项目职位', '项目职责'], value: proj.role, unique: false, key: 'projectPosition', skip_date: true },
      { name_re: /^(?:subjectDesc\d*)$/,
        parent_kw: ['项目描述', '项目内容'], value: proj.description, unique: false, key: 'projectDesc', skip_date: true },
      { label_re: /^(?:项目中职责)$/, name_re: /^(?:positionDesc\d*)$/,
        parent_kw: ['项目中职责'], value: proj.role || proj.description, unique: false, key: 'projectRole', skip_date: true },
      { label_re: /^(?:作品链接|作品地址)$/, name_re: /^(?:portfolioAddress\d*)$/, parent_kw: ['作品链接', '作品地址'],
        value: proj.link, unique: false, key: 'portfolioLink', skip_date: true },
      { name_re: /^(?:portfolioDesc\d*)$/, parent_kw: ['作品集', '作品集描述'], value: proj.name, unique: false, key: 'portfolioDesc', skip_date: true },
      { label_re: /^(?:学历类型)$/, name_re: /^(?:education_type)$/, parent_kw: ['学历类型'],
        value: edu.educationType || '统招全日制', unique: true, key: 'educationType', skip_date: true, only_select: true },
      { label_re: /^(?:目标职位类别|意向职位类别)$/, parent_kw: ['目标职位类别', '意向职位'],
        value: basic.targetPosition, unique: true, key: 'targetPositionType', skip_date: true, only_select: true },
      { label_re: /^(?:可面试方式|面试方式)$/, parent_kw: ['可面试方式', '面试方式'],
        value: '线上面试', unique: true, key: 'interviewType', skip_date: true, only_select: true },
      { label_re: /(?:学号)/, parent_kw: ['学号'], value: edu.studentId, unique: true, key: 'studentId', skip_date: true },
      { label_re: /(?:导师|指导老师|指导教师)/, name_re: /^导师$/, parent_kw: ['导师', '指导老师', '指导教师'], value: edu.advisor, unique: true, key: 'advisor', skip_date: true },
      { label_re: /(?:实验室)/, name_re: /^实验室$/, parent_kw: ['实验室'], value: edu.lab, unique: true, key: 'lab', skip_date: true },
      { label_re: /(?:研究方向|研究领域|领域方向)/, name_re: /^领域方向$/, parent_kw: ['研究方向', '研究领域', '领域方向'], value: edu.researchDirection, unique: true, key: 'researchDirection', skip_date: true },
      { label_re: /(?:GPA|绩点|成绩)/, parent_kw: ['GPA', 'GPA成绩', '绩点'], value: edu.gpa, unique: true, key: 'gpa', skip_date: true },
      { label_re: /(?:院系|学院|所在院)/, name_re: /^学院$/, parent_kw: ['院系', '学院', '所在院系', '所在院'], value: edu.department || edu.college, unique: true, key: 'department_edu', skip_date: true },
      { label_re: /(?:是否保送)/, parent_kw: ['是否保送', '保送'], value: edu.isRecommended || '否', unique: true, key: 'isRecommended', skip_date: true },
      { label_re: /(?:国家奖学金)/, parent_kw: ['国家奖学金'], value: edu.nationalScholarship || '否', unique: true, key: 'nationalScholarship', skip_date: true },
      { label_re: /(?:交换生|交换)/, parent_kw: ['交换生', '是否为交换'], value: edu.isExchange || '否', unique: true, key: 'isExchange', skip_date: true },
      { label_re: /(?:github|个人主页|个人网站)/i, parent_kw: ['Github', 'github', '个人主页'],
        value: projList[0] ? projList[0].link : null, unique: true, key: 'github', skip_date: true },
      { label_re: /(?:国家.*地区|国家\/地区|国籍.*地区|国籍\/地区)/, parent_kw: ['国家/地区', '国家', '国籍/地区', '国籍'], value: basic.currentCountry || '中国', unique: true, key: 'country_generic', skip_date: true },
      { label_re: /(?:家庭.*城市|家庭所在)/, parent_kw: ['家庭所在城市', '家庭所在'], value: basic.currentCity, unique: true, key: 'homeCity', skip_date: true },
      { label_re: /(?:学校.*城市|学校所在)/, parent_kw: ['学校所在城市', '学校所在'], value: basic.currentCity, unique: true, key: 'schoolCity', skip_date: true },
      { label_re: /(?:学校全称|学校名称)/, parent_kw: ['学校全称', '学校名称'], value: edu.school, unique: true, key: 'schoolFull', skip_date: true },
      { label_re: /(?:招聘信息来源|招聘来源)/, parent_kw: ['招聘信息来源', '招聘来源'], value: resumeData.recruitSource || '校园招聘官网', unique: true, key: 'recruitSource', skip_date: true },
      { parent_kw: ['身份证号'], value: basic.idCard || basic.idNumber, unique: true, key: 'idNumber2' },
      { label_re: /(?:行业类别|所在行业|行业)/, parent_kw: ['行业类别', '所在行业'],
        value: basic.industry || '互联网/IT', unique: true, key: 'industry', skip_date: true, only_select: true },
      { label_re: /(?:工作地点|工作城市|工作所在地)/, parent_kw: ['工作地点', '工作所在地'],
        value: basic.currentCity || work.city, unique: false, key: 'workCity', skip_date: true, only_select: true },
      { label_re: /(?:语言类型|语言名称|语言)/, parent_kw: ['语言类型', '语言名称', '语言能力'],
        value: langVal, unique: false, key: 'language' },
      { label_re: /(?:语言水平|掌握程度)/, parent_kw: ['语言水平', '掌握程度', '熟练程度'],
        value: langLevelVal, unique: false, key: 'languageLevel' },
      { label_re: /(?:奖项名称|获奖名称|奖项)/, parent_kw: ['奖项名称', '获奖名称', '奖项'],
        value: awardVal, unique: false, key: 'awardName' },
      { label_re: /(?:获奖时间|获奖日期)/, parent_kw: ['获奖时间', '获奖日期'],
        value: awardDateVal, unique: false, key: 'awardDate' },
      { label_re: /(?:获奖等级|奖项等级|级别)/, parent_kw: ['获奖等级', '奖项等级'],
        value: awardLevelVal, unique: false, key: 'awardLevel' }
    ];

    var matched = {};
    var usedKeys = {};
    var nonUniqueCount = {};

    for (var i = 0; i < fieldsMeta.length; i++) {
      var field = fieldsMeta[i];
      if (field.readOnly) {
        var ctx = (field.label || '') + ' ' + (field.parentText || '');
        if (!/身份证|开始日期|结束日期|时间|出生|生日|birthday/i.test(ctx)) continue;
      }
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        var rkey = rule.key;
        if (rule.unique && usedKeys[rkey]) continue;
        if (!rule.unique && (nonUniqueCount[rkey] || 0) >= 1) {
          var nameHit = rule.name_re && testFieldAttr(field, null, rule.name_re, null);
          var labelHit = rule.label_re && testFieldAttr(field, rule.label_re, null, null);
          var parentHit = rule.parent_kw && searchParentText(field, rule.parent_kw);
          if (!nameHit && !labelHit && !parentHit) continue;
        }
        if (rule.value == null || rule.value === '') continue;
        if (rule.skip_date && isDateRelatedField(field)) continue;
        if (rule.only_select && field.tag !== 'select' && field.tag !== 'div' && field.customType !== 'dropdown' && field.customType !== 'input-dropdown') continue;
        if (rule.skip_dropdown && (field.customType === 'dropdown' || field.customType === 'input-dropdown')) continue;

        var hit = testFieldAttr(field, rule.label_re, rule.name_re, rule.class_re);
        if (!hit && rule.parent_kw) {
          var lbl = (field.label || '').trim();
          var canTryParent = !lbl || GENERIC_LABELS[lbl] || !field.name || lbl.length <= 5;
          if (canTryParent) hit = searchParentText(field, rule.parent_kw);
        }
        if (hit) {
          matched[String(i)] = { value: rule.value, key: rkey };
          addLog('info', '规则[' + rkey + '] → 字段[' + i + ']');
          if (rule.unique) usedKeys[rkey] = true;
          else nonUniqueCount[rkey] = (nonUniqueCount[rkey] || 0) + 1;
          break;
        }
      }
    }

    // 日期字段分组匹配
    var dateIndices = [];
    for (var di = 0; di < fieldsMeta.length; di++) {
      if (matched[String(di)] || fieldsMeta[di].readOnly) continue;
      var dcls = (fieldsMeta[di].className || '').toLowerCase();
      var dlbl = (fieldsMeta[di].label || '').trim();
      var isYear = /year/.test(dcls) || dlbl === '年';
      var isMonth = /month/.test(dcls) || dlbl === '月';
      if (isYear || isMonth) dateIndices.push([di, isYear ? 'year' : 'month']);
    }

    var dateGroups = [];
    var curGroup = [];
    for (var d = 0; d < dateIndices.length; d++) {
      var dIdx = dateIndices[d][0];
      if (curGroup.length && dIdx - curGroup[curGroup.length - 1][0] > 2) {
        dateGroups.push(curGroup);
        curGroup = [];
      }
      curGroup.push(dateIndices[d]);
    }
    if (curGroup.length) dateGroups.push(curGroup);

    var workDateCount = 0;
    var eduDateUsed = false;
    var projDateUsed = false;
    for (var g = 0; g < dateGroups.length; g++) {
      var group = dateGroups[g];
      var lastIdx = group[group.length - 1][0];
      var sectionHint = '';
      for (var fi = lastIdx + 1; fi < Math.min(lastIdx + 6, fieldsMeta.length); fi++) {
        var hf = fieldsMeta[fi];
        sectionHint += ' ' + (hf.label || '') + ' ' + (hf.context || '') + ' ' + (hf.nearby || '');
      }
      var dataSource = null;
      var prefix = '';
      var isWorkHint = /公司|职位|工作|实习/.test(sectionHint);
      var isEduHint = /学校|专业|学历|就读/.test(sectionHint);
      var isProjHint = /项目/.test(sectionHint);
      if (isEduHint && !eduDateUsed) {
        dataSource = edu; prefix = 'edu'; eduDateUsed = true;
      } else if (isProjHint && !projDateUsed) {
        dataSource = proj; prefix = 'proj'; projDateUsed = true;
      } else if (isWorkHint && workDateCount < 2) {
        dataSource = work; prefix = workDateCount > 0 ? 'work' + workDateCount : 'work'; workDateCount++;
      }
      if (!dataSource) continue;

      var startDate = dataSource.startDate || '';
      var endDate = dataSource.endDate || '';
      var sParts = startDate ? startDate.split('-') : [];
      var eParts = endDate ? endDate.split('-') : [];

      if (group.length >= 4) {
        if (sParts.length >= 2) {
          matched[String(group[0][0])] = { value: sParts[0], key: prefix + '_start_year' };
          matched[String(group[1][0])] = { value: String(parseInt(sParts[1], 10)), key: prefix + '_start_month' };
        }
        if (eParts.length >= 2) {
          matched[String(group[2][0])] = { value: eParts[0], key: prefix + '_end_year' };
          matched[String(group[3][0])] = { value: String(parseInt(eParts[1], 10)), key: prefix + '_end_month' };
        }
      } else if (group.length === 2) {
        if (sParts.length >= 2) {
          matched[String(group[0][0])] = { value: sParts[0], key: prefix + '_date_year' };
          matched[String(group[1][0])] = { value: String(parseInt(sParts[1], 10)), key: prefix + '_date_month' };
        }
      }
    }

    // 日期文本输入框匹配
    var dateTextUsed = {};
    for (var ti = 0; ti < fieldsMeta.length; ti++) {
      if (matched[String(ti)]) continue;
      if (fieldsMeta[ti].tag !== 'input') continue;
      var tLbl = (fieldsMeta[ti].label || '').trim();
      var tPh = (fieldsMeta[ti].placeholder || '').trim();
      var tParent = (fieldsMeta[ti].parentText || '').trim();
      var tNearby = (fieldsMeta[ti].nearby || '').trim();
      var combined = tLbl + ' ' + tPh + ' ' + tParent + ' ' + tNearby;
      if (!/日期|时间/.test(combined) || !/开始|结束|入职|离职|起止/.test(combined)) continue;
      var tSection = fieldsMeta[ti].section || '';
      var tCtx = tSection + ' ' + tParent + ' ' + tNearby;
      var tIsStart = /开始|入职|起/.test(combined) && !/结束|离职/.test(tLbl + ' ' + tPh);
      var tDataSource = null;
      var tPrefix = '';
      if (/公司|组织|工作|实习/.test(tCtx)) { tDataSource = work; tPrefix = 'work'; }
      else if (/项目/.test(tCtx)) { tDataSource = proj; tPrefix = 'proj'; }
      else { tDataSource = edu; tPrefix = 'edu'; }
      var tDateKey = tPrefix + '_' + (tIsStart ? 'start' : 'end') + '_text';
      if (dateTextUsed[tDateKey]) continue;
      var tVal = tIsStart ? (tDataSource.startDate || '') : (tDataSource.endDate || '');
      if (tVal) {
        matched[String(ti)] = { value: tVal, key: tDateKey };
        dateTextUsed[tDateKey] = true;
      }
    }

    var fills = {};
    for (var mk in matched) fills[mk] = matched[mk].value;

    addLog('info', '规则匹配完成: ' + Object.keys(fills).length + ' 个字段命中');
    return { fills: fills, logs: logs };
  }

  // 显示浮动提示（当前字段的填充状态）
  function showFieldHint(el, text, isWaiting = false) {
    let hint = document.getElementById('rh-field-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'rh-field-hint';
      hint.style.cssText = `
        position:fixed; top:10px; left:50%; transform:translateX(-50%);
        background:${isWaiting ? '#e67e22' : '#667eea'}; color:#fff;
        padding:10px 20px; border-radius:10px; z-index:2147483647;
        font-size:14px; font-family:sans-serif; box-shadow:0 4px 20px rgba(0,0,0,0.3);
        pointer-events:none; transition:background 0.3s;
      `;
      document.body.appendChild(hint);
    }
    hint.textContent = text;
    hint.style.background = isWaiting ? '#e67e22' : '#27ae60';
    hint.style.display = 'block';

    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.style.outline = '3px solid #e67e22';
      el.style.outlineOffset = '2px';
    }
  }

  function hideFieldHint() {
    const hint = document.getElementById('rh-field-hint');
    if (hint) hint.style.display = 'none';
  }

  function clearFieldHighlight(el) {
    if (el) {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
  }

  // ========== 主流程（全自动模式） ==========

  async function startFillProcess() {
    const statusEl = document.getElementById('rh-status');
    if (!statusEl) return;

    debugLogs.length = 0;
    log('info', '=== 开始填写流程（全自动模式） ===');
    log('info', '页面URL: ' + window.location.href);
    log('info', '页面标题: ' + document.title);

    const resumeData = await new Promise((resolve) => {
      chrome.storage.local.get('resumeData', (result) => resolve(result.resumeData));
    });

    if (!resumeData || !resumeData.basic?.name) {
      updateStatus('<div class="rh-step error">✗ 请先在插件中填写并保存个人信息</div>');
      log('error', '简历数据为空或未填写姓名');
      refreshDebugContent();
      return;
    }

    log('info', '简历数据已加载，用户: ' + resumeData.basic.name);
    updateStatus('');

    addStep('正在扫描页面表单...');
    await sleep(300);

    const fields = scanFormFields();
    log('info', `扫描完成，检测到 ${fields.length} 个表单字段（含自定义控件）`);

    if (fields.length === 0) {
      replaceLastStep('未检测到表单字段', 'error');
      addStep('请确认当前页面包含需要填写的表单', 'error');
      log('error', '未检测到任何可填写的表单字段');
      refreshDebugContent();
      return;
    }

    fields.forEach((f, i) => {
      log('info', `  [${i}] tag=${f.tag} type=${f.type} custom=${f.customType || '无'} label="${f.label}" name="${f.name}" id="${f.id}" readonly=${f.readOnly} class="${(f.className || '').substring(0, 50)}"`);
    });

    replaceLastStep(`检测到 ${fields.length} 个表单字段`, 'done');

    let filledCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    try {
      addStep('正在提取字段元数据...');
      const t0 = Date.now();
      const fieldsMeta = enrichFieldMetadata(fields);
      log('info', `元数据提取耗时: ${Date.now() - t0}ms`);
      replaceLastStep('字段元数据提取完成', 'done');

      // ===== 规则匹配（本地执行，无需后端） =====
      addStep('正在进行规则匹配（本地）...');
      const t1 = Date.now();
      const ruleResult = clientRuleMatch(fieldsMeta, resumeData);
      const ruleTime = Date.now() - t1;
      log('info', `本地规则匹配耗时: ${ruleTime}ms`);

      if (ruleResult.logs) {
        ruleResult.logs.forEach(l => log(l.level, `[规则] ${l.msg}`));
      }

      const ruleFills = ruleResult.fills || {};
      const ruleCount = Object.keys(ruleFills).length;
      replaceLastStep(`规则匹配完成: ${ruleCount} 个字段命中`, 'done');

      // ===== 全自动逐个填充 =====
      addStep(`正在自动填充 ${ruleCount} 个匹配字段...`);

      let totalToProcess = 0;
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const el = getFieldElement(f);
        if (!el) continue;
        if (ruleFills[String(i)]) totalToProcess++;
      }
      log('info', `需自动填充: ${totalToProcess} 个有规则匹配的字段`);

      let processedIdx = 0;

      for (let idx = 0; idx < fields.length; idx++) {
        const field = fields[idx];
        const el = getFieldElement(field);
        if (!el) continue;

        const ruleValue = ruleFills[String(idx)];
        if (!ruleValue) continue;

        const isDropdown = field.customType === 'dropdown' || field.customType === 'input-dropdown' || field.tag === 'select';
        const fieldLabel = field.label || field.context || `字段${idx}`;

        processedIdx++;

        log('info', `填充[${processedIdx}/${totalToProcess}] 字段[${idx}]: label="${fieldLabel}" type=${field.customType || field.type} ` +
          `readonly=${field.readOnly} value="${String(ruleValue).substring(0, 40)}" isDropdown=${isDropdown}`);

        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await sleep(200);
        showFieldHint(el, `[${processedIdx}/${totalToProcess}] 填充「${fieldLabel}」...`);

        if (field.readOnly) {
          // 对readonly的日期选择器（如出生日期），尝试点击打开并输入
          const isDatePicker = /出生|生日|birthday|日期/i.test(field.label || '');
          if (!isDatePicker) {
            skippedCount++;
            log('info', `  只读字段，跳过`);
            clearFieldHighlight(el);
            continue;
          }
          log('info', `  只读日期选择器，尝试点击填充`);
        }

        let success = false;
        if (isDropdown) {
          if (field.tag === 'select') {
            success = fillSelectField(el, ruleValue);
          } else {
            success = await fillDropdownByTyping(el, ruleValue);
          }
          if (!success) {
            log('warn', `  下拉框自动选择失败: "${fieldLabel}"`);
            failedCount++;
          } else {
            filledCount++;
          }
        } else {
          success = await fillField(field, ruleValue);
          if (!success) {
            log('warn', `  文本填充失败: "${fieldLabel}"`);
            failedCount++;
          } else {
            filledCount++;
          }
        }

        clearFieldHighlight(el);
        await sleep(200);
      }

      hideFieldHint();

      replaceLastStep(`规则填充完成: 成功${filledCount}项` + (failedCount > 0 ? `, 失败${failedCount}项` : ''), filledCount > 0 ? 'done' : 'error');

      // ===== AI 补充填写 =====
      const unfilledFields = [];
      for (let ui = 0; ui < fields.length; ui++) {
        if (ruleFills[String(ui)]) continue;
        const uf = fields[ui];
        if (uf.readOnly) continue;
        if (uf.type === 'checkbox' || uf.tag === 'checkbox') continue;
        const uName = (uf.name || '').toLowerCase();
        if (['policy', 'agree', 'privacy', 'terms'].includes(uName)) continue;
        const uel = getFieldElement(uf);
        if (!uel) continue;
        unfilledFields.push({
          index: ui,
          label: uf.label || '',
          type: uf.customType || uf.type || '',
          context: fieldsMeta[ui] ? (fieldsMeta[ui].context || '') : '',
          nearby: fieldsMeta[ui] ? (fieldsMeta[ui].nearby || '') : '',
          parentText: fieldsMeta[ui] ? (fieldsMeta[ui].parentText || '') : '',
          options: fieldsMeta[ui] ? (fieldsMeta[ui].options || null) : null,
        });
      }

      let aiFilledCount = 0;
      if (unfilledFields.length > 0) {
        addStep(`正在AI分析 ${unfilledFields.length} 个未填写字段...`);
        log('info', `AI补充: 发现 ${unfilledFields.length} 个未填写字段`);

        try {
          const screenshot = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'CAPTURE_TAB' }, (r) => {
              if (chrome.runtime.lastError) {
                log('warn', 'AI截图错误: ' + chrome.runtime.lastError.message);
                resolve(null);
                return;
              }
              if (!r || !r.success) {
                log('warn', 'AI截图失败: ' + (r ? r.error : '无响应'));
                resolve(null);
                return;
              }
              resolve(r.dataUrl);
            });
          });

          log('info', `AI补充: 截图${screenshot ? '成功' : '失败（无截图模式）'}，正在调用AI...`);

          const keepAlive = setInterval(() => {
            chrome.runtime.sendMessage({ action: 'KEEPALIVE' }, () => {
              if (chrome.runtime.lastError) {}
            });
          }, 20000);

          const aiResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              action: 'AI_FILL',
              screenshotDataUrl: screenshot || '',
              unfilledFields: unfilledFields,
              resumeData: resumeData,
              pageUrl: window.location.href,
            }, (r) => {
              clearInterval(keepAlive);
              if (chrome.runtime.lastError) { resolve({ success: false, error: chrome.runtime.lastError.message }); return; }
              resolve(r || { success: false, error: '无响应' });
            });
          });

          if (aiResult && aiResult.success && aiResult.fills) {
            const aiFills = aiResult.fills;
            const aiCount = Object.keys(aiFills).length;
            log('info', `AI补充: AI返回 ${aiCount} 个填充建议`);
            replaceLastStep(`AI分析完成: ${aiCount} 个字段`, 'done');

            if (aiCount > 0) {
              addStep(`正在AI填充 ${aiCount} 个字段...`);

              for (const [aidxStr, aiValue] of Object.entries(aiFills)) {
                const aidx = parseInt(aidxStr);
                if (isNaN(aidx) || aidx < 0 || aidx >= fields.length) continue;
                const aiField = fields[aidx];
                const aiEl = getFieldElement(aiField);
                if (!aiEl || !aiValue) continue;

                const aiIsDropdown = aiField.customType === 'dropdown' || aiField.customType === 'input-dropdown' || aiField.tag === 'select';
                const aiFieldLabel = aiField.label || aiField.context || `字段${aidx}`;

                log('info', `AI填充 字段[${aidx}]: label="${aiFieldLabel}" value="${String(aiValue).substring(0, 40)}" isDropdown=${aiIsDropdown}`);

                aiEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
                await sleep(200);
                showFieldHint(aiEl, `[AI] 填充「${aiFieldLabel}」...`);

                let aiSuccess = false;
                if (aiIsDropdown) {
                  if (aiField.tag === 'select') {
                    aiSuccess = fillSelectField(aiEl, aiValue);
                  } else {
                    aiSuccess = await fillDropdownByTyping(aiEl, aiValue);
                  }
                } else {
                  aiSuccess = await fillField(aiField, aiValue);
                }

                if (aiSuccess) { aiFilledCount++; filledCount++; }
                else { failedCount++; }

                clearFieldHighlight(aiEl);
                await sleep(200);
              }

              replaceLastStep(`AI填充完成: ${aiFilledCount} 项`, 'done');
            }
          } else {
            const errMsg = aiResult ? (aiResult.error || '未知错误') : '无响应';
            log('warn', `AI补充填写失败: ${errMsg}`);
            replaceLastStep(`AI分析失败: ${errMsg}`, 'error');
          }
        } catch (aiError) {
          log('error', 'AI补充异常: ' + aiError.message);
          replaceLastStep('AI分析异常: ' + aiError.message, 'error');
        }
      } else {
        log('info', 'AI补充: 所有字段已由规则匹配填写，无需AI分析');
      }

      hideFieldHint();

      const totalProcessed = filledCount + skippedCount + failedCount;
      const summary = `完成: 规则填充${filledCount - aiFilledCount}项` +
        (aiFilledCount > 0 ? `, AI填充${aiFilledCount}项` : '') +
        (skippedCount > 0 ? `, 跳过${skippedCount}项` : '') +
        (failedCount > 0 ? `, 失败${failedCount}项` : '') +
        ` (共${totalProcessed}/${fields.length}项)`;
      addStep(summary, filledCount > 0 ? 'done' : 'error');
      log('info', summary);

      setTimeout(() => {
        document.querySelectorAll('.resume-helper-filled').forEach(el => {
          el.classList.remove('resume-helper-filled');
        });
      }, 3000);

    } catch (error) {
      hideFieldHint();
      replaceLastStep('失败: ' + error.message, 'error');
      log('error', '流程异常: ' + error.message);
      log('error', error.stack || '');
    }

    log('info', '=== 填写流程结束 ===');
    refreshDebugContent();

    try {
      chrome.runtime.sendMessage({
        action: 'SUBMIT_LOGS',
        data: {
          clientId: 'plugin-' + (navigator.userAgent.slice(-8)),
          url: window.location.href,
          title: document.title,
          logs: debugLogs.slice(),
          fieldsCount: fields ? fields.length : 0,
          filledCount: filledCount || 0,
          failedCount: failedCount || 0,
        },
      });
    } catch (e) {
      log('warn', '日志上报失败: ' + e.message);
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ========== 消息监听 ==========

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_FILL') {
      if (!panel) {
        createPanel();
      }
      panel.classList.add('show');

      if (message.resumeData) {
        chrome.storage.local.set({ resumeData: message.resumeData }, () => {
          startFillProcess().then(() => {
            sendResponse({ success: true });
          }).catch(err => {
            sendResponse({ success: false, message: err.message });
          });
        });
      } else {
        startFillProcess().then(() => {
          sendResponse({ success: true });
        }).catch(err => {
          sendResponse({ success: false, message: err.message });
        });
      }

      return true;
    }
  });

  // ========== 初始化 ==========

  function init() {
    createFAB();

    // 快捷键: Ctrl+Shift+F 开始填写
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        if (!panel) createPanel();
        panel.classList.add('show');
        startFillProcess();
      }
    });

    log('info', '简历投递助手已加载（快捷键: Ctrl+Shift+F）');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
