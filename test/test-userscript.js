/**
 * 测试用户脚本（油猴版）的核心功能
 * 通过 Puppeteer 注入脚本并模拟 GM_* API 来验证
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const pageLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    pageLogs.push(text);
    if (text.includes('简历助手') || text.includes('ERROR') || text.includes('填充') || text.includes('扫描') || text.includes('SELECT')) {
      console.log(`[PAGE] ${text}`);
    }
  });

  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 加载本地测试表单
  const formPath = path.resolve(__dirname, 'test-form.html');
  console.log('=== 加载测试表单 ===');
  await page.goto(`file://${formPath}`, { waitUntil: 'domcontentloaded' });
  await sleep(1000);

  // 注入 GM_* API 模拟
  console.log('=== 注入 GM_* API 模拟 ===');
  await page.evaluate(() => {
    const gmStore = {};
    window.GM_getValue = (key, defaultVal) => {
      return gmStore[key] !== undefined ? gmStore[key] : defaultVal;
    };
    window.GM_setValue = (key, val) => { gmStore[key] = val; };
    window.GM_addStyle = (css) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    };
    window.GM_registerMenuCommand = () => {};
    window.GM_setClipboard = (text) => { /* no-op */ };
    window.__gmStore = gmStore;
  });

  // 注入示例简历数据
  console.log('=== 注入示例简历数据 ===');
  await page.evaluate(() => {
    const sampleData = {
      basic: {
        name: '张明远', gender: '男', birthday: '2000-06-15',
        phone: '13800138000', email: 'zhangmingyuan@example.com',
        ethnicity: '汉族', political: '共青团员',
        hometown: '山东省济南市', address: '山东省济南市历下区经十路88号',
        idcard: '370102200006150012', currentCountry: '中国', currentCity: '济南',
        targetCountry: '中国', targetCity: '北京、上海、杭州',
        targetPosition: '后端开发工程师', expectedSalary: '18k-30k',
        summary: '计算机科学与技术专业应届硕士毕业生',
      },
      education: [{ school: '山东大学', degree: '硕士', major: '计算机科学与技术', startDate: '2023-09', endDate: '2026-06', gpa: '3.7/4.0' }],
      experience: [{ company: '字节跳动', position: '后端开发实习生', startDate: '2025-06', endDate: '2025-09', description: '参与推荐系统开发' }],
      projects: [{ name: '智能简历填写助手', role: '项目负责人', startDate: '2025-03', endDate: '2025-12', techStack: 'JavaScript', description: '开发智能简历工具', link: 'https://github.com/example' }],
      awards: [{ name: '国家奖学金', date: '2024-06', level: '国家级' }],
      skills: 'Python、Java、Go', languages: '普通话、英语',
    };
    window.__gmStore['resumeData'] = sampleData;
  });

  // 读取并注入用户脚本
  console.log('=== 注入用户脚本 ===');
  const scriptContent = fs.readFileSync(path.resolve(__dirname, 'resume-helper.user.js'), 'utf8');
  const cleanScript = scriptContent.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');

  await page.evaluate(cleanScript);
  await sleep(2000);

  // 验证 FAB 按钮是否创建
  console.log('=== 验证 FAB 按钮 ===');
  const fabExists = await page.evaluate(() => !!document.getElementById('resume-helper-fab'));
  console.log(`FAB 按钮存在: ${fabExists}`);

  if (!fabExists) {
    console.log('FAB 按钮未创建，测试失败！');
    await browser.close();
    process.exit(1);
  }

  // 打开面板
  console.log('=== 打开面板 ===');
  await page.evaluate(() => {
    const fab = document.getElementById('resume-helper-fab');
    fab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 100 }));
    fab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100, clientY: 100 }));
  });
  await sleep(800);

  const panelVisible = await page.evaluate(() => {
    const panel = document.getElementById('resume-helper-panel');
    return panel && panel.classList.contains('show');
  });
  console.log(`面板已显示: ${panelVisible}`);

  if (!panelVisible) {
    await page.evaluate(() => document.getElementById('resume-helper-fab').click());
    await sleep(500);
  }

  // 点击"开始填写"
  console.log('=== 开始填写 ===');
  await page.evaluate(() => {
    const btn = document.getElementById('rh-btn-fill');
    if (btn) btn.click();
  });

  // 等待填充完成：监听页面日志中"填写流程结束"标记
  console.log('=== 等待填充完成 ===');
  let fillDone = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (pageLogs.some(l => l.includes('填写流程结束'))) {
      fillDone = true;
      console.log(`填充完成 (${i+1}s)`);
      break;
    }
    if (i % 5 === 4) {
      try {
        const status = await page.evaluate(() => {
          const el = document.getElementById('rh-status');
          return el ? el.textContent : '';
        });
        console.log(`等待中... (${i+1}s) 状态: ${status.substring(0, 200)}`);
      } catch (e) {
        console.log(`等待中... (${i+1}s) 状态查询失败: ${e.message.substring(0, 100)}`);
      }
    }
  }

  if (!fillDone) {
    console.log('填写超时（30s），继续验证已填内容');
  }

  await sleep(2000);

  // 验证填写结果
  console.log('\n=== 验证填写结果 ===');
  let results;
  try {
    results = await page.evaluate(() => {
      const checks = {
        '姓名': { selector: '#fullName', expected: '张明远' },
        '手机': { selector: '#phone', expected: '13800138000' },
        '邮箱': { selector: '#email', expected: 'zhangmingyuan@example.com' },
        '民族': { selector: '#ethnicity', expected: '汉族' },
        '身份证': { selector: '#idNumber', expected: '370102200006150012' },
        '当前国家': { selector: '#currentCountry', expected: '中国' },
        '当前城市': { selector: '#currentCity', expected: '济南' },
        '地址': { selector: '#address', expected: '山东省济南市历下区经十路88号' },
        '目标城市': { selector: '#targetCity', expected: '北京、上海、杭州' },
        '目标职位': { selector: '#targetJob', expected: '后端开发工程师' },
        '学校': { selector: '#school', expected: '山东大学' },
        '专业': { selector: '#major', expected: '计算机科学与技术' },
        'GPA': { selector: '#gpa', expected: '3.7/4.0' },
        '公司': { selector: '#companyName', expected: '字节跳动' },
        '职位': { selector: '#jobTitle', expected: '后端开发实习生' },
        '项目名称': { selector: '#projectName', expected: '智能简历填写助手' },
        '技能': { selector: '#skills', expected: 'Python、Java、Go' },
      };
      const results = {};
      for (const [name, check] of Object.entries(checks)) {
        const el = document.querySelector(check.selector);
        const actual = el ? el.value : '(未找到元素)';
        results[name] = { expected: check.expected, actual, pass: actual === check.expected };
      }

      const genderRadio = document.querySelector('input[name="gender"][value="male"]');
      results['性别(男)'] = { expected: 'checked', actual: genderRadio && genderRadio.checked ? 'checked' : 'unchecked', pass: genderRadio && genderRadio.checked };

      // 列出所有表单字段的值以便调试
      const allFields = {};
      document.querySelectorAll('input, select, textarea').forEach(el => {
        if (el.type === 'hidden' || el.type === 'submit') return;
        const key = el.name || el.id || el.placeholder;
        if (key) allFields[key] = el.type === 'radio' ? (el.checked ? el.value + '(checked)' : el.value) : (el.type === 'checkbox' ? String(el.checked) : el.value);
      });
      results._allFields = allFields;

      return results;
    });
  } catch (e) {
    console.log(`验证失败（frame可能已断开）: ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  // 打印所有字段值以便调试
  console.log('\n--- 所有字段当前值 ---');
  const allFields = results._allFields || {};
  delete results._allFields;
  for (const [k, v] of Object.entries(allFields)) {
    if (v) console.log(`  ${k}: "${v}"`);
  }

  console.log('\n--- 验证结果 ---');
  let passCount = 0, failCount = 0;
  for (const [name, result] of Object.entries(results)) {
    const status = result.pass ? 'PASS ✓' : 'FAIL ✗';
    console.log(`  ${status} ${name}: expected="${result.expected}" actual="${result.actual}"`);
    if (result.pass) passCount++;
    else failCount++;
  }

  const total = passCount + failCount;
  const rate = total > 0 ? (passCount / total * 100).toFixed(1) : 0;
  console.log(`\n=== 结果: ${passCount}/${total} 通过 (${rate}%) ===`);

  await page.screenshot({ path: '/opt/resume-ext-test/screenshots/userscript-test.png', fullPage: true });
  console.log('截图已保存');

  await browser.close();
  process.exit(failCount > 0 ? 1 : 0);
})();
