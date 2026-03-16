// ==UserScript==
// @name         简历投递助手
// @namespace    https://0xffff87.github.io
// @version      1.1.0
// @description  AI驱动的简历自动填写，支持百度、腾讯、字节跳动等主流招聘网站。在页面右下角点击悬浮按钮开始填写。
// @author       0xffff87
// @match        *://talent.baidu.com/*
// @match        *://careers.tencent.com/*
// @match        *://job.bytedance.com/*
// @match        *://jobs.bytedance.com/*
// @match        *://campus.*.com/*
// @match        *://*.zhaopin.com/*
// @match        *://*.51job.com/*
// @match        *://*.lagou.com/*
// @match        *://*.liepin.com/*
// @match        *://*.boss.com/*
// @match        *://www.zhipin.com/*
// @match        *://*.hotjob.cn/*
// @match        *://*.nowcoder.com/*
// @match        *://*.sungrow.com/*
// @match        *://*.huawei.com/*
// @match        *://*.alibaba.com/*
// @match        *://talent.alibaba.com/*
// @match        *://*.meituan.com/*
// @match        *://*.jd.com/*
// @match        *://*.xiaomi.com/*
// @match        *://*.didi.com/*
// @match        *://*.bilibili.com/*
// @match        *://*.kuaishou.com/*
// @match        *://*.pinduoduo.com/*
// @match        *://*.nio.com/*
// @match        *://*.oppo.com/*
// @match        *://*.vivo.com/*
// @match        *://*.midea.com/*
// @match        *://*.suning.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @license      MIT
// @icon         https://0xffff87.github.io/icons/icon48.png
// @homepage     https://0xffff87.github.io/website/
// @downloadURL  https://0xffff87.github.io/website/resume-helper.user.js
// @updateURL    https://0xffff87.github.io/website/resume-helper.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.__resumeHelperLoaded) return;
  window.__resumeHelperLoaded = true;

  // ========== 注入样式 ==========
  GM_addStyle(`
#resume-helper-fab{position:fixed;bottom:30px;right:30px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);border:none;cursor:pointer;box-shadow:0 4px 16px rgba(102,126,234,.4);z-index:2147483647;display:flex;align-items:center;justify-content:center;transition:all .3s ease}
#resume-helper-fab:hover{transform:scale(1.1);box-shadow:0 6px 24px rgba(102,126,234,.6)}
#resume-helper-fab svg{width:24px;height:24px}
#resume-helper-panel{position:fixed;bottom:92px;right:30px;width:340px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.15);z-index:2147483647;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;display:none}
#resume-helper-panel.show{display:block;animation:rhSlideUp .3s ease}
@keyframes rhSlideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
#resume-helper-panel .rh-header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:14px 16px;font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}
#resume-helper-panel .rh-body{padding:16px;max-height:300px;overflow-y:auto}
#resume-helper-panel .rh-status{font-size:13px;color:#444;line-height:1.6}
#resume-helper-panel .rh-status .rh-step{display:flex;align-items:center;gap:8px;padding:4px 0}
#resume-helper-panel .rh-status .rh-step.done{color:#27ae60}
#resume-helper-panel .rh-status .rh-step.active{color:#667eea;font-weight:500}
#resume-helper-panel .rh-status .rh-step.error{color:#e74c3c}
#resume-helper-panel .rh-actions{padding:12px 16px;border-top:1px solid #f0f0f0;display:flex;gap:8px}
#resume-helper-panel .rh-btn{flex:1;padding:8px 12px;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:all .2s;font-family:inherit}
#resume-helper-panel .rh-btn-primary{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff}
#resume-helper-panel .rh-btn-primary:hover{opacity:.9}
#resume-helper-panel .rh-btn-secondary{background:#f5f5f5;color:#666}
#resume-helper-panel .rh-btn-secondary:hover{background:#eee}
.resume-helper-filled{outline:2px solid rgba(102,126,234,.5)!important;outline-offset:1px;transition:outline-color 2s ease}
.rh-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(102,126,234,.2);border-top-color:#667eea;border-radius:50%;animation:rhSpin .8s linear infinite}
@keyframes rhSpin{to{transform:rotate(360deg)}}
#rh-data-modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
#rh-data-modal .rh-modal-box{background:#fff;border-radius:16px;width:520px;max-height:80vh;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column}
#rh-data-modal .rh-modal-header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:16px 20px;font-size:16px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
#rh-data-modal .rh-modal-header button{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;padding:0 4px}
#rh-data-modal .rh-modal-body{padding:20px;overflow-y:auto;flex:1}
#rh-data-modal .rh-modal-body textarea{width:100%;min-height:200px;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:13px;font-family:Consolas,Monaco,monospace;resize:vertical;box-sizing:border-box}
#rh-data-modal .rh-modal-body textarea:focus{outline:none;border-color:#667eea;box-shadow:0 0 0 3px rgba(102,126,234,.15)}
#rh-data-modal .rh-modal-actions{padding:16px 20px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end}
#rh-data-modal .rh-modal-actions button{padding:8px 20px;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s}
#rh-data-modal .rh-modal-hint{font-size:12px;color:#64748b;margin-bottom:12px;line-height:1.6}
  `);

  // ========== 存储适配（GM_getValue / GM_setValue） ==========
  const storage = {
    get(key) {
      try { return GM_getValue(key, null); } catch (e) { return null; }
    },
    set(key, value) {
      try { GM_setValue(key, value); } catch (e) { console.warn('[简历助手] 存储写入失败:', e); }
    }
  };

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
  function getDebugText() { return debugLogs.map(l => `[${l.time}][${l.level}] ${l.msg}`).join('\n'); }

  // ========== UI 组件 ==========
  let fab, panel;

  function createFAB() {
    fab = document.createElement('button');
    fab.id = 'resume-helper-fab';
    fab.title = '简历投递助手（可拖拽移动）';
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>';
    let isDragging = false, dragStartX, dragStartY, fabStartX, fabStartY;
    fab.addEventListener('mousedown', (e) => { isDragging = false; dragStartX = e.clientX; dragStartY = e.clientY; const r = fab.getBoundingClientRect(); fabStartX = r.left; fabStartY = r.top; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => { if (dragStartX == null) return; const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY; if (!isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) isDragging = true; if (isDragging) { fab.style.left = Math.max(0, Math.min(window.innerWidth - 52, fabStartX + dx)) + 'px'; fab.style.top = Math.max(0, Math.min(window.innerHeight - 52, fabStartY + dy)) + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto'; } });
    document.addEventListener('mouseup', () => { if (!isDragging && dragStartX != null) togglePanel(); dragStartX = null; isDragging = false; });
    fab.addEventListener('click', (e) => { if (!isDragging && dragStartX == null) togglePanel(); });
    document.body.appendChild(fab);
  }

  function createPanel() {
    panel = document.createElement('div');
    panel.id = 'resume-helper-panel';
    panel.innerHTML = `
      <div class="rh-header"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>简历投递助手 <span style="font-size:11px;opacity:.7;margin-left:auto">油猴脚本版</span></div>
      <div class="rh-body"><div class="rh-status" id="rh-status"><p>点击下方按钮开始智能填写当前页面表单。</p><p style="margin-top:8px;font-size:12px;color:#999;">提示：请先在「数据管理」中导入你的简历 JSON 数据。</p></div></div>
      <div class="rh-actions">
        <button class="rh-btn rh-btn-secondary" id="rh-btn-close">关闭</button>
        <button class="rh-btn rh-btn-secondary" id="rh-btn-data" style="color:#667eea;">数据</button>
        <button class="rh-btn rh-btn-secondary" id="rh-btn-debug" style="color:#e67e22;">调试</button>
        <button class="rh-btn rh-btn-primary" id="rh-btn-fill">开始填写</button>
      </div>`;
    document.body.appendChild(panel);
    document.getElementById('rh-btn-close').addEventListener('click', () => panel.classList.remove('show'));
    document.getElementById('rh-btn-debug').addEventListener('click', showDebugPanel);
    document.getElementById('rh-btn-fill').addEventListener('click', startFillProcess);
    document.getElementById('rh-btn-data').addEventListener('click', showDataModal);
  }

  // ========== 数据管理弹窗 ==========
  function showDataModal() {
    let modal = document.getElementById('rh-data-modal');
    if (modal) { modal.style.display = 'flex'; refreshDataModal(); return; }
    modal = document.createElement('div');
    modal.id = 'rh-data-modal';
    const currentData = storage.get('resumeData');
    const statusText = currentData && currentData.basic && currentData.basic.name
      ? `已加载: ${currentData.basic.name} 的简历数据`
      : '尚未导入简历数据';
    modal.innerHTML = `
      <div class="rh-modal-box">
        <div class="rh-modal-header"><span>📋 简历数据管理</span><button id="rh-modal-close">&times;</button></div>
        <div class="rh-modal-body">
          <div class="rh-modal-hint" id="rh-data-status">状态: ${statusText}</div>
          <div class="rh-modal-hint">将简历 JSON 数据粘贴到下方，或从 <a href="https://0xffff87.github.io/website/" target="_blank" style="color:#667eea">在线编辑器</a> 导出后粘贴：</div>
          <textarea id="rh-data-textarea" placeholder='粘贴 JSON 数据到这里...\n\n格式示例:\n{\n  "basic": {\n    "name": "张三",\n    "phone": "13800138000",\n    ...\n  },\n  "education": [...],\n  ...\n}'></textarea>
        </div>
        <div class="rh-modal-actions">
          <button id="rh-data-export" style="background:#f1f5f9;color:#334155;">导出当前数据</button>
          <button id="rh-data-clear" style="background:#fef2f2;color:#dc2626;">清空</button>
          <button id="rh-data-import" style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">导入并保存</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    document.getElementById('rh-modal-close').addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('rh-data-import').addEventListener('click', () => {
      const text = document.getElementById('rh-data-textarea').value.trim();
      if (!text) { alert('请先粘贴简历 JSON 数据'); return; }
      try {
        const data = JSON.parse(text);
        if (!data.basic || !data.basic.name) { alert('数据格式不正确：缺少 basic.name 字段'); return; }
        storage.set('resumeData', data);
        document.getElementById('rh-data-status').textContent = `状态: 已保存 ${data.basic.name} 的简历数据 ✓`;
        document.getElementById('rh-data-status').style.color = '#059669';
        alert('简历数据已保存！现在可以关闭此窗口，在招聘表单页面点击「开始填写」了。');
      } catch (e) { alert('JSON 解析失败: ' + e.message); }
    });
    document.getElementById('rh-data-export').addEventListener('click', () => {
      const data = storage.get('resumeData');
      if (!data) { alert('暂无数据可导出'); return; }
      document.getElementById('rh-data-textarea').value = JSON.stringify(data, null, 2);
      document.getElementById('rh-data-textarea').select();
    });
    document.getElementById('rh-data-clear').addEventListener('click', () => {
      if (!confirm('确定要清空简历数据吗？')) return;
      storage.set('resumeData', null);
      document.getElementById('rh-data-textarea').value = '';
      document.getElementById('rh-data-status').textContent = '状态: 数据已清空';
      document.getElementById('rh-data-status').style.color = '#dc2626';
    });
  }

  function refreshDataModal() {
    const statusEl = document.getElementById('rh-data-status');
    if (!statusEl) return;
    const d = storage.get('resumeData');
    statusEl.textContent = d && d.basic && d.basic.name ? `状态: 已加载 ${d.basic.name} 的简历数据` : '尚未导入简历数据';
    statusEl.style.color = d ? '#059669' : '#64748b';
  }

  function showDebugPanel() {
    let dp = document.getElementById('rh-debug-panel');
    if (!dp) {
      dp = document.createElement('div');
      dp.id = 'rh-debug-panel';
      dp.style.cssText = 'position:fixed;top:10%;left:10%;right:10%;bottom:10%;background:#1a1a2e;color:#e0e0e0;border-radius:12px;z-index:2147483647;display:flex;flex-direction:column;font-family:Consolas,"Courier New",monospace;font-size:12px;box-shadow:0 8px 40px rgba(0,0,0,.4)';
      dp.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:rgba(255,255,255,.05);border-radius:12px 12px 0 0"><span style="font-weight:bold;color:#667eea">调试日志</span><div><button id="rh-debug-scan" style="background:#667eea;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;margin-right:8px;font-size:12px">扫描表单</button><button id="rh-debug-copy" style="background:#555;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;margin-right:8px;font-size:12px">复制日志</button><button id="rh-debug-close" style="background:#e74c3c;color:#fff;border:none;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px">关闭</button></div></div><pre id="rh-debug-content" style="flex:1;overflow:auto;padding:12px 16px;margin:0;white-space:pre-wrap;word-break:break-all;line-height:1.6"></pre>';
      document.body.appendChild(dp);
      document.getElementById('rh-debug-close').addEventListener('click', () => dp.style.display = 'none');
      document.getElementById('rh-debug-copy').addEventListener('click', () => { navigator.clipboard.writeText(getDebugText()).then(() => alert('日志已复制')); });
      document.getElementById('rh-debug-scan').addEventListener('click', () => {
        debugLogs.length = 0;
        log('info', '=== 手动扫描表单开始 ===');
        const fields = scanFormFields();
        log('info', `共检测到 ${fields.length} 个表单字段：`);
        fields.forEach((f, i) => { const section = getSectionName(getFieldElement(f)); log('info', `  [${i}] tag=${f.tag} type=${f.type} label="${f.label}" name="${f.name}" section="${section}" customType=${f.customType || '无'}`); });
        log('info', '=== 扫描完成 ===');
        refreshDebugContent();
      });
    }
    dp.style.display = 'flex';
    refreshDebugContent();
  }

  function refreshDebugContent() {
    const el = document.getElementById('rh-debug-content');
    if (el) { el.textContent = debugLogs.length > 0 ? getDebugText() : '暂无日志。点击"扫描表单"或"开始填写"后显示。'; el.scrollTop = el.scrollHeight; }
  }

  function togglePanel() { if (!panel) createPanel(); panel.classList.toggle('show'); }
  function updateStatus(html) { const el = document.getElementById('rh-status'); if (el) el.innerHTML = html; }
  function addStep(text, status = 'active') { const el = document.getElementById('rh-status'); if (!el) return; const icon = status === 'done' ? '✓' : status === 'error' ? '✗' : '<span class="rh-spinner"></span>'; el.innerHTML += `<div class="rh-step ${status}">${icon} ${text}</div>`; }
  function replaceLastStep(text, status) { const el = document.getElementById('rh-status'); if (!el) return; const steps = el.querySelectorAll('.rh-step'); if (steps.length > 0) { const last = steps[steps.length - 1]; const icon = status === 'done' ? '✓' : status === 'error' ? '✗' : '<span class="rh-spinner"></span>'; last.className = `rh-step ${status}`; last.innerHTML = `${icon} ${text}`; } }

  // ========== 表单检测（与扩展版相同） ==========

  function getLabelForElement(el) {
    if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
      var innerLabel = el.querySelector(':scope > [class*="brick-field-label"], :scope > [class*="field-label"], :scope > label, :scope > .label');
      if (innerLabel) { var t = innerLabel.textContent.trim(); if (t.length > 0 && t.length < 60) return t; }
      var phSpan = el.querySelector('.ant-select-selection-placeholder');
      if (phSpan) { var pt = phSpan.textContent.trim(); if (pt.length > 0 && pt.length < 60) return pt; }
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) { const parts = labelledBy.split(/\s+/).map(id => document.getElementById(id)).filter(Boolean).map(n => n.textContent.trim()).filter(Boolean); if (parts.length > 0) return parts.join(' / '); }
    if (el.id) { const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (label) return label.textContent.trim(); }
    const parentLabel = el.closest('label');
    if (parentLabel) { const clone = parentLabel.cloneNode(true); clone.querySelectorAll('input, select, textarea').forEach(c => c.remove()); const text = clone.textContent.trim(); if (text) return text; }
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
    if (el.placeholder) return el.placeholder;
    const prev = el.previousElementSibling;
    if (prev && ['LABEL', 'SPAN', 'DIV', 'P', 'H3', 'H4'].includes(prev.tagName)) { const text = prev.textContent.trim(); if (text.length > 0 && text.length < 60) return text; }
    let ancestor = el.parentElement;
    for (let i = 0; i < 5 && ancestor; i++) {
      let sibling = ancestor.previousElementSibling;
      if (sibling) { const isLabel = sibling.tagName === 'LABEL' || sibling.classList.contains('label') || /label|title|name|header/i.test(sibling.className); if (isLabel) { const t = sibling.textContent.trim(); if (t.length > 0 && t.length < 60) return t; } }
      const parent = ancestor;
      const lblEl = parent.querySelector(':scope > label, :scope > .label, :scope > [class*="label"], :scope > [class*="title"], :scope > legend, :scope > dt, :scope > th, :scope > span[class*="name"]');
      if (lblEl && !lblEl.contains(el)) { const t = lblEl.textContent.trim(); if (t.length > 0 && t.length < 80) return t; }
      for (const child of parent.childNodes) { if (child.nodeType === 3) { const t = child.textContent.trim(); if (t.length > 0 && t.length < 50) return t; } }
      ancestor = ancestor.parentElement;
    }
    if (el.title) return el.title;
    if (el.name) return el.name;
    return '';
  }

  function getSelectOptions(el) { if (el.tagName === 'SELECT') return Array.from(el.options).filter(o => o.value).map(o => ({ value: o.value, text: o.textContent.trim() })); return []; }

  function isVisible(el) {
    if (!el.offsetParent && el.style.position !== 'fixed' && el.style.position !== 'absolute') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) < 0.1) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  function scanCustomSelects() {
    const customs = [], seen = new Set();
    const selectors = ['[class*="select"][class*="down"]', '[class*="select"][class*="icon"]', '[class*="dropdown"][role]', '[class*="selector"]', '[class*="picker"]', '[role="combobox"]', 'div[class*="select"]:not(select)', 'span[class*="select"]:not(select)', 'div[class*="ud__select"]', 'div[class*="brick-select"]', 'div[class*="ant-select"]', 'div[class*="el-select"]', 'div[class*="throne-biz-date-range-picker"]', 'div[class*="brick-date-picker"]'];
    selectors.forEach(sel => { try { document.querySelectorAll(sel).forEach(el => {
      if (!isVisible(el) || el.closest('#resume-helper-panel, #resume-helper-fab, #rh-debug-panel, #rh-data-modal') || seen.has(el) || ['INPUT','SELECT','TEXTAREA'].includes(el.tagName) || ['I','SVG','IMG'].includes(el.tagName)) return;
      if (el.tagName === 'SPAN' && /icon|caret|arrow/i.test(el.className)) return;
      const rect = el.getBoundingClientRect(); if (rect.width < 30 || rect.height < 20) return;
      seen.add(el);
      customs.push({ element: el, tag: el.tagName.toLowerCase(), type: 'custom-select', customType: 'dropdown', label: getLabelForElement(el), name: el.getAttribute('data-name') || '', id: el.id || '', placeholder: el.getAttribute('data-placeholder') || '', value: el.textContent.trim().substring(0, 100), required: el.classList.contains('required'), options: [], className: el.className || '', ariaLabel: el.getAttribute('aria-label') || '', readOnly: false, context: '' });
    }); } catch (e) {} });
    return customs;
  }

  function isDropdownTriggerInput(el) {
    let ancestor = el.parentElement;
    for (let i = 0; i < 6 && ancestor; i++) {
      const cls = ancestor.className || '';
      if (/\bSelect\b|sd-Select|ud__select|brick-select|ant-select|el-select|select(?!All|or|ed|ion)/i.test(cls)) { const hasArrow = ancestor.querySelector('[class*="arrow"], [class*="caret"], [class*="suffix"]'); if (hasArrow) return true; if (/\b\w*Select\w*\b/.test(cls) || /sd-Select/i.test(cls)) return true; }
      if (/dropdown|picker|throne-biz-date|brick-date/i.test(cls) && !/input/i.test(cls)) return true;
      ancestor = ancestor.parentElement;
    }
    if (el.closest('[role="combobox"]')) return true;
    const combined = (el.placeholder || '') + ' ' + getLabelForElement(el);
    if (/请输入|输入|请填写|搜索/.test(combined)) return false;
    if (['请选择', '请选择...', '-- 请选择 --'].includes((el.placeholder || '').trim())) return true;
    return false;
  }

  function scanFormFields() {
    const fields = [], elementRefs = [];
    document.querySelectorAll('input, select, textarea, [contenteditable="true"], [role="textbox"]').forEach((el) => {
      if (!isVisible(el) || el.closest('#resume-helper-panel, #resume-helper-fab, #rh-debug-panel, #rh-data-modal')) return;
      if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button' || el.type === 'file' || el.type === 'image' || el.type === 'reset' || el.disabled) return;
      const field = { index: fields.length, tag: el.tagName.toLowerCase(), type: el.type || el.getAttribute('role') || 'text', customType: null, label: getLabelForElement(el), name: el.name || '', id: el.id || '', placeholder: el.placeholder || '', value: el.value || el.textContent || '', required: el.required || el.getAttribute('aria-required') === 'true', options: getSelectOptions(el), className: el.className || '', ariaLabel: el.getAttribute('aria-label') || '', readOnly: el.readOnly || false };
      if (el.tagName === 'INPUT' && (el.type === 'text' || !el.type) && isDropdownTriggerInput(el)) field.customType = 'input-dropdown';
      const parent = el.closest('[class*="form"], [class*="field"], [class*="group"], [class*="item"], [class*="row"], [class*="wrapper"], [class*="control"], [class*="brick-field"], [class*="ud__form"]');
      if (parent) { const contextEl = parent.querySelector('[class*="label"], [class*="title"], [class*="name"], [class*="text"], [class*="brick-field-label"], legend, dt, th, label'); if (contextEl && contextEl !== el) field.context = contextEl.textContent.trim().substring(0, 100); }
      fields.push(field); elementRefs.push(el);
    });
    scanCustomSelects().forEach(cf => {
      if (elementRefs.some(existing => existing === cf.element || existing.contains(cf.element) || cf.element.contains(existing))) return;
      cf.index = fields.length;
      const parent = cf.element.closest('[class*="form"], [class*="field"], [class*="group"], [class*="item"], [class*="row"], [class*="wrapper"], [class*="brick-field"], [class*="ud__form"]');
      if (parent) { const contextEl = parent.querySelector('[class*="label"], [class*="title"], [class*="brick-field-label"], legend, label'); if (contextEl && contextEl !== cf.element) cf.context = contextEl.textContent.trim().substring(0, 100); }
      fields.push(cf); elementRefs.push(cf.element);
    });
    window.__rhElementRefs = elementRefs;
    return fields;
  }

  function getFieldElement(field) { if (window.__rhElementRefs && window.__rhElementRefs[field.index]) { const el = window.__rhElementRefs[field.index]; if (!document.contains(el)) return null; return el; } return null; }

  // ========== 表单填充函数（与扩展版完全一致） ==========

  function triggerInputEvents(el) { el.dispatchEvent(new Event('focus', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' })); el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: el.value })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' })); el.dispatchEvent(new Event('blur', { bubbles: true })); const re = new Event('input', { bubbles: true }); Object.defineProperty(re, 'simulated', { value: true }); el.dispatchEvent(re); const tracker = el._valueTracker; if (tracker) tracker.setValue(''); el.dispatchEvent(new Event('input', { bubbles: true })); }

  function setNativeValue(el, value) { try { const s = Object.getOwnPropertyDescriptor(el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value')?.set; if (s) s.call(el, value); else el.value = value; } catch (e) { el.value = value; } triggerInputEvents(el); }

  async function inputByClipboardPaste(el, value) {
    el.focus(); await sleep(100);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.select(); else document.execCommand('selectAll', false, null);
    await sleep(50);
    try { await navigator.clipboard.writeText(value); } catch (e) { const tmp = document.createElement('textarea'); tmp.value = value; tmp.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(tmp); tmp.select(); document.execCommand('copy'); document.body.removeChild(tmp); el.focus(); if (el.select) el.select(); await sleep(50); }
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', keyCode: 86, ctrlKey: true, bubbles: true, cancelable: true }));
    const dt = new DataTransfer(); dt.setData('text/plain', value);
    el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'v', code: 'KeyV', keyCode: 86, ctrlKey: true, bubbles: true }));
    await sleep(100);
    if (el.value === String(value)) return true;
    try { el.focus(); if (el.select) el.select(); document.execCommand('insertText', false, value); await sleep(50); if (el.value === String(value)) return true; } catch (e) {}
    setNativeValue(el, value);
    return el.value === String(value);
  }

  function fillTextField(el, value) { if (!value) return false; el.focus(); setNativeValue(el, value); if (el.value !== String(value)) { el.setAttribute('value', value); el.value = value; triggerInputEvents(el); } if (el.value !== String(value)) { try { el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, value); triggerInputEvents(el); } catch (e) {} } el.classList.add('resume-helper-filled'); return true; }

  function findBestMatch(options, value) {
    if (!value || options.length === 0) return null;
    const vt = value.trim(), vl = vt.toLowerCase(), vn = vl.replace(/[\s\-_\/()（）]/g, '');
    let m = options.find(o => o.textContent.trim() === vt); if (m) return m;
    m = options.find(o => o.textContent.trim().toLowerCase() === vl); if (m) return m;
    m = options.find(o => { const t = o.textContent.trim().toLowerCase(); return t.length > 0 && (t.includes(vl) || vl.includes(t)); }); if (m) return m;
    m = options.find(o => { const t = o.textContent.trim().toLowerCase().replace(/[\s\-_\/()（）]/g, ''); return t.length > 0 && (t.includes(vn) || vn.includes(t)); }); if (m) return m;
    const ALIASES = { '中国':['中国大陆','中国(大陆)','china'],'男':['男性','male'],'女':['女性','female'],'本科':['大学本科','本科/学士','学士'],'硕士':['硕士研究生','研究生/硕士'],'博士':['博士研究生'],'大专':['专科','高职'],'共青团员':['团员'],'中共党员':['党员'],'中共预备党员':['预备党员'],'群众':['无党派'],'汉族':['汉'] };
    const altList = ALIASES[vt] || ALIASES[vl];
    if (altList) { m = options.find(o => { const t = o.textContent.trim().toLowerCase(); return altList.some(a => t === a.toLowerCase() || t.includes(a.toLowerCase())); }); if (m) return m; }
    return null;
  }

  function fillSelectField(el, value) { if (!value) return false; const options = Array.from(el.options).filter(o => o.value); const match = findBestMatch(options.map(o => ({ textContent: o.textContent, _opt: o })), value); if (match) { el.focus(); el.value = match._opt.value; match._opt.selected = true; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('input', { bubbles: true })); triggerInputEvents(el); el.classList.add('resume-helper-filled'); log('info', `  SELECT: "${value}" -> "${match._opt.textContent.trim()}"`); return true; } log('warn', `  SELECT失败: "${value}"`); return false; }

  function fillDateField(el, value) { if (!value) return false; el.focus(); setNativeValue(el, value.replace(/\//g, '-')); el.classList.add('resume-helper-filled'); return true; }

  function fillRadioOrCheckbox(el, value) { if (!value) return false; if (el.type === 'checkbox') { el.checked = ['true','是','yes','1'].includes(String(value)); triggerInputEvents(el); el.classList.add('resume-helper-filled'); return true; } if (!el.name) return false; for (const radio of document.querySelectorAll(`input[name="${CSS.escape(el.name)}"]`)) { const label = getLabelForElement(radio); if (radio.value === value || label === value || label.includes(value) || value.includes(label)) { radio.checked = true; triggerInputEvents(radio); radio.classList.add('resume-helper-filled'); return true; } } return false; }

  function fillContentEditable(el, value) { if (!value) return false; el.focus(); el.textContent = value; triggerInputEvents(el); el.classList.add('resume-helper-filled'); return true; }

  function closeAllDropdowns() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.body.click(); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); }

  const OPTION_SELECTORS = ['[role="option"]','.el-select-dropdown__item','.ant-select-item','.ant-select-item-option','.ant-cascader-menu-item','[class*="option"]:not([class*="options-"])','[class*="dropdown"] li','[class*="menu"] li','[class*="select"] li','ul[class*="drop"] li','div[class*="pop"] [class*="item"]','div[class*="overlay"] li'];

  function snapshotVisibleOptions() { const s = new Set(); OPTION_SELECTORS.forEach(sel => { try { document.querySelectorAll(sel).forEach(el => { if (isVisible(el) && !el.closest('#resume-helper-panel, #resume-helper-fab, #rh-debug-panel, #rh-data-modal')) s.add(el); }); } catch (e) {} }); return s; }
  function findNewOptions(pre) { const r = [], seen = new Set(); OPTION_SELECTORS.forEach(sel => { try { document.querySelectorAll(sel).forEach(el => { if (seen.has(el) || pre.has(el) || !isVisible(el) || el.closest('#resume-helper-panel, #resume-helper-fab, #rh-debug-panel, #rh-data-modal') || el.querySelector('[role="option"], [class*="option"]')) return; seen.add(el); r.push(el); }); } catch (e) {} }); return r; }
  function findOptionsInPopups() { for (const pSel of ['[class*="dropdown"]:not([style*="display: none"])','[class*="popup"]:not([style*="display: none"])','[class*="popover"]:not([style*="display: none"])','[class*="overlay"]:not([style*="display: none"])','[class*="drop"]:not([style*="display: none"])','[class*="menu"]:not([style*="display: none"])']) { try { for (const c of document.querySelectorAll(pSel)) { if (!isVisible(c)) continue; const items = Array.from(c.querySelectorAll('li, [class*="item"], [class*="option"], [role="option"]')).filter(i => isVisible(i) && !i.querySelector('[role="option"], [class*="option"]')); if (items.length > 1) return items; } } catch (e) {} } return []; }

  function simulateFullClick(el) { const rect = el.getBoundingClientRect(); const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2; const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }; el.dispatchEvent(new MouseEvent('mouseenter', opts)); el.dispatchEvent(new MouseEvent('mouseover', opts)); el.dispatchEvent(new MouseEvent('mousedown', opts)); el.focus && el.focus(); el.dispatchEvent(new MouseEvent('mouseup', opts)); el.dispatchEvent(new MouseEvent('click', opts)); }

  async function tryKeyboardSelect(el, value, preSnapshot) { const ti = el.tagName === 'INPUT' ? el : (el.querySelector('input') || el); ti.focus(); await sleep(200); if (ti.tagName === 'INPUT') { setNativeValue(ti, ''); await sleep(100); setNativeValue(ti, value); await sleep(600); } let options = findNewOptions(preSnapshot || new Set()); if (options.length === 0) options = findOptionsInPopups(); if (options.length > 0) { const match = findBestMatch(options, value); if (match) { const mi = options.indexOf(match); for (let i = 0; i <= mi; i++) { ti.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true })); await sleep(50); } await sleep(100); ti.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); ti.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); await sleep(300); el.classList.add('resume-helper-filled'); closeAllDropdowns(); await sleep(200); return true; } else { ti.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true })); await sleep(100); ti.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); await sleep(300); const nt = (el.textContent || el.value || '').trim(); if (nt && nt !== '请选择' && nt !== value) { el.classList.add('resume-helper-filled'); closeAllDropdowns(); await sleep(200); return true; } } } closeAllDropdowns(); await sleep(100); return false; }

  async function fillCustomSelect(el, value) {
    if (!value) return false;
    log('info', `  尝试填充自定义下拉: "${value}"`);
    closeAllDropdowns(); await sleep(300);
    const preSnapshot = snapshotVisibleOptions();
    el.scrollIntoView({ block: 'center', behavior: 'instant' }); await sleep(150);
    simulateFullClick(el);
    let optionElements = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(attempt === 0 ? 600 : 400);
      optionElements = findNewOptions(preSnapshot); if (optionElements.length > 1) break;
      optionElements = findOptionsInPopups(); if (optionElements.length > 1) break;
      if (attempt < 2) simulateFullClick(el);
    }
    if (optionElements.length > 0) {
      const match = findBestMatch(optionElements, value);
      if (match) { simulateFullClick(match); await sleep(200); el.classList.add('resume-helper-filled'); log('info', `  自定义下拉成功: "${match.textContent.trim()}"`); await sleep(300); closeAllDropdowns(); await sleep(200); return true; }
      log('info', `  尝试键盘方案...`); closeAllDropdowns(); await sleep(300);
      if (await tryKeyboardSelect(el, value, preSnapshot)) return true;
    }
    if (el.tagName === 'INPUT') { closeAllDropdowns(); await sleep(300); if (await tryKeyboardSelect(el, value, preSnapshot)) return true; }
    if (el.tagName !== 'INPUT') { const input = el.querySelector('input'); if (input) { setNativeValue(input, value); el.classList.add('resume-helper-filled'); closeAllDropdowns(); await sleep(200); return true; } }
    closeAllDropdowns(); await sleep(100);
    log('warn', `  自定义下拉填充失败: "${value}"`);
    return false;
  }

  async function fillDropdownByTyping(el, value) {
    if (!value) return false;
    const targetInput = el.tagName === 'INPUT' ? el : (el.querySelector('input') || el);
    const beforeValue = targetInput.value || '';
    const beforeText = (el.closest('[class*="Select"]') || el.parentElement || el).textContent || '';
    document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(200); targetInput.focus(); await sleep(100); targetInput.click(); await sleep(400);
    if (targetInput.tagName === 'INPUT' || targetInput.tagName === 'TEXTAREA') { targetInput.select(); await sleep(50); }
    setNativeValue(targetInput, ''); await sleep(200); setNativeValue(targetInput, value); await sleep(500);
    if (targetInput.value !== String(value)) { targetInput.focus(); await sleep(50); await inputByClipboardPaste(targetInput, value); await sleep(500); }
    await sleep(500);
    let optionClicked = await tryClickMatchingOption(el, value);
    if (!optionClicked) { await sleep(500); optionClicked = await tryClickMatchingOption(el, value); }
    if (!optionClicked) { await sleep(800); optionClicked = await tryClickMatchingOption(el, value); }
    if (!optionClicked) {
      targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      await sleep(300); targetInput.focus(); await sleep(100); targetInput.click(); await sleep(500);
      if (targetInput.tagName === 'INPUT') { targetInput.select(); await sleep(50); }
      setNativeValue(targetInput, ''); await sleep(100); await inputByClipboardPaste(targetInput, value); await sleep(800);
      optionClicked = await tryClickMatchingOption(el, value);
      if (!optionClicked) { await sleep(500); optionClicked = await tryClickMatchingOption(el, value); }
    }
    if (optionClicked) { await sleep(400); }
    else {
      targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
      await sleep(150);
      targetInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
      await sleep(500);
    }
    const afterValue = targetInput.value || '';
    const selectContainer = el.closest('[class*="Select"], [class*="select"], [class*="ud__select"], [class*="brick-select"], [class*="ant-select"], [class*="el-select"]') || el.parentElement || el;
    const afterText = selectContainer.textContent || '';
    if (afterText.includes(value) || afterValue.includes(value) || (afterValue !== beforeValue && afterValue !== '' && afterValue !== '请选择') || afterText !== beforeText) { el.classList.add('resume-helper-filled'); return true; }
    return false;
  }

  async function tryClickMatchingOption(el, value) {
    const inputEl = el.tagName === 'INPUT' ? el : (el.querySelector('input') || el);
    const inputLabel = inputEl.closest('label');
    const inputSelectContainer = inputEl.closest('[class*="Select"]');
    function isPartOfInputContainer(c) { if (c.contains(inputEl) || inputEl.contains(c)) return true; if (inputLabel && inputLabel.contains(c)) return true; if (inputSelectContainer && inputSelectContainer === c) return true; if (c.querySelector && c.querySelector('input')) return true; return false; }
    const optionSelectors = ['[class*="option"]','[class*="Option"]','[class*="menu-item"]','[role="option"]','li[class*="item"]','.ant-select-item','.el-select-dropdown__item','.ant-select-item-option','[class*="select-li"]','[class*="Popup"] li','[class*="popup"] li','[class*="menu"] li','[class*="popper"] li','[class*="overlay"] li'];
    let exactMatch = null, partialMatch = null;
    for (const selector of optionSelectors) { try { for (const opt of document.querySelectorAll(selector)) { if (!opt.offsetHeight || !opt.offsetWidth || isPartOfInputContainer(opt)) continue; const t = opt.textContent.trim(); if (!t) continue; if (t === value) { exactMatch = opt; break; } if (!partialMatch && t.includes(value)) partialMatch = opt; } if (exactMatch) break; } catch (e) {} }
    if (!exactMatch) { for (let i = document.body.children.length - 1; i >= Math.max(0, document.body.children.length - 15); i--) { const c = document.body.children[i]; if (!c.offsetHeight || c.id === 'resume-helper-fab' || c.id === 'resume-helper-panel' || c.tagName === 'SCRIPT' || c.tagName === 'STYLE') continue; for (const item of c.querySelectorAll('li, div[class*="item"], div[class*="option"], span[class*="item"]')) { if (!item.offsetHeight || !item.offsetWidth || isPartOfInputContainer(item)) continue; const t = item.textContent.trim(); if (!t || t.length > 50) continue; if (t === value) { exactMatch = item; break; } if (!partialMatch && t.includes(value)) partialMatch = item; } if (exactMatch) break; } }
    let target = exactMatch || partialMatch;
    if (target) { target.scrollIntoView({ block: 'nearest' }); await sleep(50); target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await sleep(80); target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); await sleep(30); target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })); target.click(); return true; }
    return false;
  }

  async function fillField(field, value) {
    const el = getFieldElement(field); if (!el || !value) return false;
    try {
      if (field.customType === 'dropdown' || field.customType === 'input-dropdown') return await fillCustomSelect(el, value);
      switch (field.tag) {
        case 'select': return fillSelectField(el, value);
        case 'textarea': return fillTextField(el, value);
        case 'input':
          if (['date','month','datetime-local'].includes(field.type)) return fillDateField(el, value);
          if (['radio','checkbox'].includes(field.type)) return fillRadioOrCheckbox(el, String(value));
          return fillTextField(el, value);
        default:
          if (el.getAttribute('contenteditable') === 'true' || field.type === 'textbox') return fillContentEditable(el, value);
          return fillTextField(el, value);
      }
    } catch (e) { log('error', `填充异常[${field.index}]: ${e.message}`); return false; }
  }

  // ========== DOM 信息提取 & 规则匹配引擎 ==========

  function getSectionName(el) { if (!el) return ''; let node = el; for (let i = 0; i < 10 && node; i++) { node = node.parentElement; if (!node) break; const sels = ['fieldset','[class*="section"]','[class*="block"]','[class*="module"]','[class*="card"]','[class*="panel"]','[class*="resume"]','h2','h3']; for (const sel of sels) { if (node.matches && node.matches(sel)) { const h = node.querySelector('h2,h3,h4,legend,[class*="title"],[class*="header"]'); if (h) { const t = h.textContent.trim(); if (t.length > 0 && t.length < 40) return t; } } } } return ''; }

  function enrichFieldMetadata(fields) {
    return fields.map((f) => {
      const el = getFieldElement(f);
      const e = { tag: f.tag, type: f.type, customType: f.customType || null, label: f.label || '', name: f.name || '', id: (f.id && f.id.length < 30) ? f.id : '', placeholder: f.placeholder || '', value: (f.value || '').substring(0, 100), className: (f.className || '').substring(0, 80), ariaLabel: f.ariaLabel || '', readOnly: f.readOnly || false, options: (f.options || []).slice(0, 30) };
      if (f.context) e.context = f.context.substring(0, 60);
      if (el) {
        const section = getSectionName(el); if (section) e.section = section;
        // nearby text
        const texts = [];
        let prev = el.previousElementSibling;
        for (let i = 0; i < 3 && prev; i++) { const t = prev.textContent?.trim(); if (t && t.length < 30 && t.length > 0) { texts.unshift(t); break; } prev = prev.previousElementSibling; }
        const parent = el.parentElement;
        if (parent) { const lbl = parent.querySelector('label, [class*="label"], [class*="title"], span:first-child'); if (lbl && lbl !== el) { const lt = lbl.textContent?.trim(); if (lt && lt.length < 30 && !texts.includes(lt)) texts.push(lt); } }
        if (texts.length > 0) e.nearby = texts.join(' | ').substring(0, 60);
        // parent text
        const pt = []; let nd = el;
        for (let d = 0; d < 5 && nd; d++) { nd = nd.parentElement; if (!nd) break; const ii = nd.querySelectorAll('input, textarea, select'); if (ii.length > 3) continue; for (const ch of nd.childNodes) { if (ch.nodeType === 3) { const t = ch.textContent.trim(); if (t.length > 0 && t.length < 40 && !pt.includes(t)) pt.push(t); } } const ls = nd.querySelectorAll(':scope > label, :scope > span, :scope > div > label, :scope > [class*="label"]'); for (const l of ls) { if (l.contains(el)) continue; const t = l.textContent.trim(); if (t.length > 0 && t.length < 40 && !pt.includes(t)) pt.push(t); } if (pt.length >= 3) break; }
        if (pt.length > 0) e.parentText = pt.join(' ').substring(0, 80);
      }
      return e;
    });
  }

  function clientRuleMatch(fieldsMeta, resumeData) {
    var basic = resumeData.basic || {}, edu = (resumeData.education || [])[0] || {}, work = (resumeData.work || resumeData.experience || [])[0] || {}, proj = (resumeData.projects || [])[0] || {};
    var GENERIC_LABELS = { '联系信息':1,'工作经验':1,'学历':1,'基础信息':1,'教育经历':1,'项目经验':1,'补充信息':1,'请输入':1,'请选择':1,'请填写':1,'开始日期':1,'结束日期':1 };
    function testFA(f, lr, nr, cr) { if (lr) { for (const a of ['label','placeholder','ariaLabel']) { if (f[a] && lr.test(f[a])) return true; } } if (nr) { for (const a of ['name','id']) { if (f[a] && nr.test(f[a])) return true; } } if (cr && f.className && cr.test(f.className)) return true; return false; }
    function searchPT(f, kws) { if (!kws) return false; var ctx = (f.context || '') + ' ' + (f.nearby || '') + ' ' + (f.parentText || ''); for (var k of kws) { if (ctx.indexOf(k) !== -1) return true; } return false; }
    function isDateField(f) { var cls = (f.className || '').toLowerCase(); if (/year|month|date-?picker|calendar/.test(cls)) return true; var lbl = (f.label || '').trim(); if (/^(年|月|开始时间|结束时间)$/.test(lbl)) return true; return false; }
    var rules = [
      { label_re: /^(?:姓名|真实姓名|请输入真实姓名|请输入姓名|名字)$/, name_re: /^(?:name|姓名)$/, parent_kw: ['姓名','名字','真实姓名'], value: basic.name, unique: true, key: 'name' },
      { label_re: /^(?:区号)$/, class_re: /telephone-region/, parent_kw: ['区号'], value: '+86', unique: true, key: 'areaCode' },
      { label_re: /(?:手机|电话|联系方式|手机号)/, name_re: /^(?:phone|mobile|tel)$/, class_re: /telephone-input|phone-input/, parent_kw: ['手机','电话','联系方式','手机号码'], value: basic.phone, unique: true, key: 'phone' },
      { label_re: /(?:邮箱|邮件|电子邮箱)/, name_re: /^(?:e-?mail|email|邮箱)$/, parent_kw: ['邮箱','邮件'], value: basic.email, unique: true, key: 'email' },
      { label_re: /^(?:性别)$/, name_re: /^(?:gender|sex)$/, parent_kw: ['性别'], value: basic.gender, unique: true, key: 'gender' },
      { label_re: /(?:工作经验|工作年限)/, parent_kw: ['工作经验','工作年限'], value: basic.workExperience || '无工作经验', unique: true, key: 'workExperience', only_select: true },
      { label_re: /(?:出生|生日|birthday)/, name_re: /(?:birth)/, parent_kw: ['出生','生日'], value: basic.birthday, unique: true, key: 'birthday' },
      { label_re: /(?:证件号码|身份证号|个人证件)/, name_re: /(?:cardnum|idcard|idnumber|identification)/, parent_kw: ['证件号码','身份证号'], value: basic.idCard || basic.idNumber || basic.idcard, unique: true, key: 'idNumber', skip_dropdown: true },
      { label_re: /(?:政治面貌)/, parent_kw: ['政治面貌'], value: basic.politicalStatus || basic.political, unique: true, key: 'political' },
      { label_re: /(?:民族|族别)/, parent_kw: ['民族'], value: basic.ethnicity, unique: true, key: 'ethnicity' },
      { label_re: /(?:籍贯|户口)/, parent_kw: ['籍贯','户口'], value: basic.hometown, unique: true, key: 'hometown' },
      { label_re: /(?:通信地址|住址|通讯地址|地址|详细住址)/, name_re: /^(?:address)$/i, parent_kw: ['通信地址','地址','住址'], value: basic.address, unique: true, key: 'address' },
      { label_re: /(?:选择国家|当前居住国家|居住国家|当前所在国家)/, name_re: /^(?:currentCountry)$/i, parent_kw: ['当前居住国家','居住国家'], value: basic.currentCountry || '中国', unique: true, key: 'currentCountry' },
      { label_re: /(?:现居住|所在地|当前城市|居住城市|省\/市|当前所在城市)/, name_re: /^(?:currentCity)$/i, parent_kw: ['现居住','所在地','当前城市','当前所在城市'], value: basic.currentCity, unique: true, key: 'currentCity' },
      { label_re: /(?:意向.*城市|意愿.*城市|意向.*地点|目标.*城市|期望.*城市)/, parent_kw: ['意向工作城市','期望工作城市'], value: basic.targetCity, unique: true, key: 'targetCity' },
      { label_re: /(?:期望.*薪|年薪|月薪|期望薪资)/, parent_kw: ['期望年薪','年薪','月薪','期望薪资'], value: basic.expectedSalary, unique: true, key: 'expectedSalary' },
      { label_re: /(?:自我评价|自我介绍|自我描述|补充信息|简介|介绍自己)/, parent_kw: ['自我评价','自我介绍','补充信息','介绍自己'], value: basic.summary || resumeData.summary, unique: true, key: 'summary' },
      { label_re: /^(?:学校|学校名称|请输入就读学校)$/, name_re: /^(?:school|学校名称)$/, parent_kw: ['学校名称','学校'], value: edu.school, unique: false, key: 'school', skip_date: true },
      { label_re: /^(?:专业|专业名称)$/, name_re: /^(?:major|field_of_study)$/, parent_kw: ['专业名称','专业'], value: edu.major, unique: false, key: 'major', skip_date: true },
      { label_re: /^(?:学历|最高学历)$/, name_re: /^(?:degree|education)$/, parent_kw: ['学历','最高学历'], value: edu.degree, unique: false, key: 'degree', skip_date: true, only_select: true },
      { label_re: /^(?:公司名称|企业名称)$/, name_re: /^(?:company|companyName)$/, parent_kw: ['公司名称','企业名称'], value: work.company, unique: false, key: 'company', skip_date: true },
      { label_re: /^(?:工作职位|岗位名称|职位名称)$/, name_re: /^(?:positionName|title|职位名称)$/, parent_kw: ['岗位名称','职位名称','工作职位'], value: work.position || work.title, unique: false, key: 'position', skip_date: true },
      { label_re: /^(?:工作描述|工作内容)$/, name_re: /^(?:workDesc)$/, parent_kw: ['工作职责','工作内容','工作描述'], value: work.description, unique: false, key: 'workDesc', skip_date: true },
      { label_re: /^(?:项目名称)$/, parent_kw: ['项目名称'], value: proj.name, unique: false, key: 'projectName', skip_date: true },
      { label_re: /(?:GPA|绩点|成绩)/, parent_kw: ['GPA','绩点'], value: edu.gpa, unique: true, key: 'gpa', skip_date: true },
      { label_re: /(?:行业类别|所在行业|行业)/, parent_kw: ['行业类别','所在行业'], value: basic.industry || '互联网/IT', unique: true, key: 'industry', skip_date: true, only_select: true },
    ];
    var matched = {}, usedKeys = {}, nonUniqueCount = {};
    for (var i = 0; i < fieldsMeta.length; i++) {
      var f = fieldsMeta[i]; if (f.readOnly) continue;
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        if (rule.unique && usedKeys[rule.key]) continue;
        if (!rule.unique && (nonUniqueCount[rule.key] || 0) >= 1) { if (!rule.name_re || !testFA(f, null, rule.name_re, null)) continue; }
        if (rule.value == null || rule.value === '') continue;
        if (rule.skip_date && isDateField(f)) continue;
        if (rule.only_select && f.tag !== 'select' && f.customType !== 'dropdown' && f.customType !== 'input-dropdown') continue;
        if (rule.skip_dropdown && (f.customType === 'dropdown' || f.customType === 'input-dropdown')) continue;
        var hit = testFA(f, rule.label_re, rule.name_re, rule.class_re);
        if (!hit && rule.parent_kw) { var lbl = (f.label || '').trim(); if (!lbl || GENERIC_LABELS[lbl] || lbl.length <= 5) hit = searchPT(f, rule.parent_kw); }
        if (hit) { matched[String(i)] = { value: rule.value, key: rule.key }; if (rule.unique) usedKeys[rule.key] = true; else nonUniqueCount[rule.key] = (nonUniqueCount[rule.key] || 0) + 1; break; }
      }
    }
    var fills = {}; for (var mk in matched) fills[mk] = matched[mk].value;
    return { fills: fills };
  }

  function showFieldHint(el, text) { let h = document.getElementById('rh-field-hint'); if (!h) { h = document.createElement('div'); h.id = 'rh-field-hint'; h.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:#27ae60;color:#fff;padding:10px 20px;border-radius:10px;z-index:2147483647;font-size:14px;font-family:sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);pointer-events:none'; document.body.appendChild(h); } h.textContent = text; h.style.display = 'block'; if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.style.outline = '3px solid #e67e22'; el.style.outlineOffset = '2px'; } }
  function hideFieldHint() { const h = document.getElementById('rh-field-hint'); if (h) h.style.display = 'none'; }
  function clearFieldHighlight(el) { if (el) { el.style.outline = ''; el.style.outlineOffset = ''; } }

  // ========== 主流程 ==========

  async function startFillProcess() {
    const statusEl = document.getElementById('rh-status');
    if (!statusEl) return;
    debugLogs.length = 0;
    log('info', '=== 开始填写流程 ===');
    log('info', '页面: ' + window.location.href);

    const resumeData = storage.get('resumeData');
    if (!resumeData || !resumeData.basic?.name) {
      updateStatus('<div class="rh-step error">✗ 请先在「数据」中导入简历 JSON 数据</div>');
      log('error', '简历数据为空'); refreshDebugContent(); return;
    }
    log('info', '简历数据已加载: ' + resumeData.basic.name);
    updateStatus('');
    addStep('正在扫描页面表单...'); await sleep(300);

    const fields = scanFormFields();
    log('info', `扫描完成: ${fields.length} 个字段`);
    if (fields.length === 0) { replaceLastStep('未检测到表单字段', 'error'); refreshDebugContent(); return; }
    fields.forEach((f, i) => log('info', `  [${i}] tag=${f.tag} type=${f.type} custom=${f.customType || '无'} label="${f.label}" name="${f.name}"`));
    replaceLastStep(`检测到 ${fields.length} 个字段`, 'done');

    let filledCount = 0, failedCount = 0;
    try {
      addStep('正在提取元数据...');
      const fieldsMeta = enrichFieldMetadata(fields);
      replaceLastStep('元数据提取完成', 'done');

      addStep('正在规则匹配...');
      const ruleResult = clientRuleMatch(fieldsMeta, resumeData);
      const ruleFills = ruleResult.fills || {};
      const ruleCount = Object.keys(ruleFills).length;
      replaceLastStep(`规则匹配: ${ruleCount} 个字段命中`, 'done');

      addStep(`正在填充 ${ruleCount} 个字段...`);
      let processedIdx = 0;
      for (let idx = 0; idx < fields.length; idx++) {
        const field = fields[idx], el = getFieldElement(field);
        if (!el || !ruleFills[String(idx)]) continue;
        const ruleValue = ruleFills[String(idx)];
        const isDropdown = field.customType === 'dropdown' || field.customType === 'input-dropdown' || field.tag === 'select';
        const fieldLabel = field.label || field.context || `字段${idx}`;
        processedIdx++;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(200);
        showFieldHint(el, `[${processedIdx}/${ruleCount}] 填充「${fieldLabel}」...`);
        if (field.readOnly) { clearFieldHighlight(el); continue; }
        let success = false;
        if (isDropdown) { success = field.tag === 'select' ? fillSelectField(el, ruleValue) : await fillDropdownByTyping(el, ruleValue); }
        else { success = await fillField(field, ruleValue); }
        if (success) filledCount++; else failedCount++;
        clearFieldHighlight(el); await sleep(200);
      }
      hideFieldHint();
      const summary = `完成: 成功${filledCount}项` + (failedCount > 0 ? `, 失败${failedCount}项` : '') + ` (共${fields.length}项)`;
      addStep(summary, filledCount > 0 ? 'done' : 'error');
      log('info', summary);
      setTimeout(() => document.querySelectorAll('.resume-helper-filled').forEach(el => el.classList.remove('resume-helper-filled')), 3000);
    } catch (error) {
      hideFieldHint();
      replaceLastStep('失败: ' + error.message, 'error');
      log('error', '流程异常: ' + error.message);
    }
    log('info', '=== 填写流程结束 ===');
    refreshDebugContent();
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  // ========== Tampermonkey 菜单命令 ==========
  GM_registerMenuCommand('📋 管理简历数据', showDataModal);
  GM_registerMenuCommand('▶ 开始填写', () => { if (!panel) createPanel(); panel.classList.add('show'); startFillProcess(); });

  // ========== 初始化 ==========
  function init() {
    createFAB();
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        if (!panel) createPanel();
        panel.classList.add('show');
        startFillProcess();
      }
    });
    log('info', '简历投递助手已加载（油猴脚本版）快捷键: Ctrl+Shift+F');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
