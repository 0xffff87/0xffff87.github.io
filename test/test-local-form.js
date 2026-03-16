/**
 * 本地模拟表单自动化测试
 * 使用 test-form.html 模拟招聘网站表单进行填充验证
 * 在 j1900 运行: cd /opt/resume-ext-test && node test-local-form.js
 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CHROME_PATH = '/opt/chrome-linux64/chrome';
const EXTENSION_PATH = '/opt/resume-ext';
const USER_DATA_DIR = '/tmp/chrome-test-' + Date.now();
const SCREENSHOT_DIR = '/opt/resume-ext-test/screenshots';
const TEST_FORM_PATH = '/opt/resume-ext/test/test-form.html';

const SAMPLE_RESUME = {
  basic: {
    name: '张明远', gender: '男', birthday: '2000-06-15',
    phone: '13800138000', email: 'zhangmingyuan@example.com',
    ethnicity: '汉族', political: '共青团员', politicalStatus: '共青团员',
    hometown: '山东省济南市', address: '山东省济南市历下区经十路88号',
    idCard: '370102200006150012', idcard: '370102200006150012',
    currentCountry: '中国', currentCity: '济南',
    targetCountry: '中国', targetCity: '北京',
    targetPosition: '后端开发工程师', expectedSalary: '18k-30k',
    summary: '计算机科学与技术专业应届硕士毕业生，具有扎实的编程基础和丰富的项目经验。',
    wechat: 'zhangmingyuan2000',
    workExperience: '无工作经验',
    industry: '互联网/IT',
  },
  education: [{
    school: '山东大学', degree: '硕士', major: '计算机科学与技术',
    startDate: '2023-09', endDate: '2026-06', gpa: '3.7/4.0',
    department: '计算机科学与技术学院', educationType: '统招全日制',
  }],
  experience: [{
    company: '字节跳动', position: '后端开发实习生',
    department: '推荐架构部',
    startDate: '2025-06', endDate: '2025-09',
    description: '参与内容推荐系统后端服务开发，负责推荐算法接口优化和性能调优。',
  }],
  projects: [{
    name: '智能简历填写助手', role: '项目负责人',
    startDate: '2025-01', endDate: '2025-06',
    description: '基于浏览器插件和AI技术，开发智能简历自动填写工具。',
    link: 'https://github.com/zhangmingyuan/resume-helper',
  }],
  awards: [{ name: '校级优秀学生', date: '2024-06', level: '校级' }],
  skills: 'Python、Java、Go、JavaScript', courses: '', certificates: 'CET-6 560分',
  languages: '普通话（母语）、英语（CET-6）', hobbies: '篮球、编程',
};

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`  [截图] ${name}`);
}

async function main() {
  console.log('=== 本地模拟表单测试 ===');
  console.log(`时间: ${new Date().toLocaleString('zh-CN')}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    userDataDir: USER_DATA_DIR,
    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--display=:0', '--window-size=1920,1080', '--enable-extensions',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  await sleep(3000);

  // 注入简历数据
  const allTargets = await browser.targets();
  let extensionId = '';
  for (const t of allTargets) {
    const m = t.url().match(/chrome-extension:\/\/([^/]+)/);
    if (m) extensionId = m[1];
  }
  console.log(`扩展ID: ${extensionId}`);

  if (extensionId) {
    const optPage = await browser.newPage();
    await optPage.goto(`chrome-extension://${extensionId}/options/options.html`, { waitUntil: 'domcontentloaded' });
    await sleep(1000);
    await optPage.evaluate((r) => chrome.storage.local.set({ resumeData: r }), SAMPLE_RESUME);
    console.log('简历数据已注入');
    await optPage.close();
  }

  // 打开测试表单
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  console.log('加载测试表单...');
  await page.goto(`file://${TEST_FORM_PATH}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  await screenshot(page, 'local-01-loaded');

  // 点击FAB按钮
  const fabExists = await page.evaluate(() => {
    const fab = document.getElementById('resume-helper-fab');
    if (fab) { fab.click(); return true; }
    return false;
  });
  console.log(`FAB按钮: ${fabExists ? '已点击' : '未找到'}`);
  await sleep(1000);

  // 点击填充按钮
  const fillClicked = await page.evaluate(() => {
    const btn = document.getElementById('rh-btn-fill');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log(`填充按钮: ${fillClicked ? '已点击' : '未找到'}`);

  if (!fillClicked) {
    console.log('✗ 填充按钮未找到');
    await screenshot(page, 'local-error');
    await browser.close();
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    return;
  }

  // 等待填充完成
  console.log('等待填充完成...');
  const startTime = Date.now();
  let completed = false;

  while (Date.now() - startTime < 180000) {
    await sleep(3000);

    const status = await page.evaluate(() => {
      const el = document.getElementById('rh-status');
      return el ? el.textContent.trim() : '';
    });

    const hint = await page.evaluate(() => {
      const el = document.getElementById('rh-field-hint');
      return el && el.style.display !== 'none' ? el.textContent.trim().substring(0, 80) : '';
    });

    if (hint) console.log(`  ${hint}`);

    if ((status.includes('共') && status.includes('项)')) || /=== 填写流程结束 ===/.test(status)) {
      console.log(`=== 填充结束: ${status.substring(0, 200)} ===`);
      completed = true;
      break;
    }
  }

  await sleep(2000);
  await screenshot(page, 'local-02-filled');

  // 验证填充结果
  console.log('\n=== 验证填充结果 ===');
  const results = await page.evaluate(() => {
    const checks = [];
    const fields = [
      { id: 'fullName', expected: '张明远', name: '姓名' },
      { id: 'phone', expected: '13800138000', name: '手机号码' },
      { id: 'email', expected: 'zhangmingyuan@example.com', name: '电子邮箱' },
      { id: 'idNumber', expected: '370102200006150012', name: '身份证号' },
      { id: 'ethnicity', expected: '汉族', name: '民族' },
      { id: 'currentCountry', expected: '中国', name: '当前国家' },
      { id: 'currentCity', expected: '济南', name: '当前城市' },
      { id: 'address', expected: '山东省济南市历下区经十路88号', name: '地址' },
      { id: 'targetCity', expected: '北京', name: '意向城市' },
      { id: 'school', expected: '山东大学', name: '学校' },
      { id: 'major', expected: '计算机科学与技术', name: '专业' },
      { id: 'gpa', expected: '3.7/4.0', name: 'GPA' },
      { id: 'companyName', expected: '字节跳动', name: '公司名称' },
      { id: 'jobTitle', expected: '后端开发实习生', name: '职位' },
      { id: 'projectName', expected: '智能简历填写助手', name: '项目名称' },
      { id: 'selfIntro', expected: null, name: '自我评价' },
    ];

    for (const f of fields) {
      const el = document.getElementById(f.id);
      if (!el) { checks.push({ name: f.name, pass: false, actual: 'NOT_FOUND' }); continue; }
      const actual = el.value || '';
      if (f.expected) {
        checks.push({ name: f.name, pass: actual.includes(f.expected) || f.expected.includes(actual), actual: actual.substring(0, 50), expected: f.expected });
      } else {
        checks.push({ name: f.name, pass: actual.length > 0, actual: actual.substring(0, 50), expected: '非空' });
      }
    }
    return checks;
  });

  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    if (r.pass) passCount++;
    else failCount++;
    console.log(`  ${icon} ${r.name}: ${r.pass ? '通过' : '失败'} (actual="${r.actual}"${r.expected ? ` expected="${r.expected}"` : ''})`);
  }

  const rate = (passCount / results.length * 100).toFixed(1);
  console.log(`\n=== 结果汇总 ===`);
  console.log(`  总计: ${results.length} 项`);
  console.log(`  通过: ${passCount} 项`);
  console.log(`  失败: ${failCount} 项`);
  console.log(`  通过率: ${rate}%`);

  // 获取调试日志
  await page.evaluate(() => {
    const btn = document.getElementById('rh-btn-debug');
    if (btn) btn.click();
  });
  await sleep(500);
  const logs = await page.evaluate(() => {
    const pre = document.querySelector('#rh-debug-panel pre');
    return pre ? pre.textContent : '';
  });
  if (logs) {
    const logPath = path.join(SCREENSHOT_DIR, 'local-test-logs.txt');
    fs.writeFileSync(logPath, logs);
    console.log(`日志已保存: ${logPath}`);
  }

  await browser.close();
  fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  console.log('\n=== 测试完成 ===');
}

main().catch(e => {
  console.error('测试失败:', e.message);
  process.exit(1);
});
