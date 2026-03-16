const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const CHROME_PATH = '/opt/chrome-linux64/chrome';
const EXTENSION_PATH = '/opt/resume-ext';
const USER_DATA_DIR = '/root/.config/google-chrome-for-testing';
const SCREENSHOT_DIR = '/opt/resume-ext-test/screenshots';
const TARGET_URL = 'https://join.wps.cn/campus-recruitment/wps/41436?sourceToken=8379ee777457c4d22fc65d4439f660b3#/candidateHome/resume';

const SAMPLE_RESUME = {
  basic: {
    name: '张明远', gender: '男', birthday: '2000-06-15',
    phone: '13800138000', email: 'zhangmingyuan@example.com',
    ethnicity: '汉族', politicalStatus: '共青团员',
    hometown: '山东省济南市', address: '山东省济南市历下区经十路88号',
    idCard: '370102200006150012', currentCountry: '中国', currentCity: '济南',
    targetCountry: '中国', targetCity: '北京',
    targetPosition: '后端开发工程师', expectedSalary: '18k-30k',
    summary: '计算机科学与技术专业应届硕士毕业生，具有扎实的编程基础和丰富的项目经验。',
    wechat: 'zhangmingyuan2000',
    workExperience: '无工作经验',
  },
  education: [{
    school: '山东大学', degree: '硕士', major: '计算机科学与技术',
    startDate: '2023-09', endDate: '2026-06', gpa: '3.7/4.0',
    department: '计算机科学与技术学院',
  }],
  experience: [{
    company: '字节跳动', position: '后端开发实习生',
    department: '推荐架构部',
    startDate: '2025-06', endDate: '2025-09',
    description: '参与内容推荐系统后端服务开发，负责推荐算法接口优化和性能调优，使用Go和Python进行微服务开发。',
  }],
  projects: [{
    name: '智能简历填写助手', role: '项目负责人',
    startDate: '2025-01', endDate: '2025-06',
    description: '基于浏览器插件和AI技术，开发智能简历自动填写工具。',
    link: 'https://github.com/zhangmingyuan/resume-helper',
  }],
  awards: [], skills: 'Python、Java、Go、JavaScript',
  courses: '', certificates: '', languages: '',
};

const BACKEND_CONFIG = {
  serverUrl: 'http://localhost:5000',
  pluginKey: 'rh-2dc49c8702041328353733bcf8e4aa43',
};

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`[截图] ${name}`);
}

async function main() {
  console.log('=== 自动化测试开始 ===');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    userDataDir: USER_DATA_DIR,
    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--display=:99', '--window-size=1920,1080', '--enable-extensions',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  await sleep(3000);

  // 找扩展ID并注入数据
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
    await optPage.evaluate((r, b) => chrome.storage.local.set({ resumeData: r, backendConfig: b }), SAMPLE_RESUME, BACKEND_CONFIG);
    console.log('简历数据已注入');
    await optPage.close();
  }

  // 导航
  const pages = await browser.pages();
  const page = pages[0] || await browser.newPage();
  console.log('导航到简历页面...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => console.log('页面超时'));
  await sleep(5000);
  await screenshot(page, 'auto-01-page');

  // 关闭登录弹窗
  await page.keyboard.press('Escape');
  await sleep(1000);
  await screenshot(page, 'auto-02-after-esc');

  // 检查是否已登录（是否还有登录弹窗）
  const hasLoginModal = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    for (const el of els) {
      if (el.textContent && el.textContent.includes('请输入手机号') && el.offsetHeight > 0) return true;
    }
    return false;
  });
  console.log(`登录弹窗: ${hasLoginModal ? '仍存在' : '已关闭/已登录'}`);

  // 点击FAB按钮
  await sleep(500);
  const fabExists = await page.evaluate(() => {
    const fab = document.getElementById('resume-helper-fab');
    if (fab) { fab.click(); return true; }
    return false;
  });
  console.log(`FAB: ${fabExists ? '已点击' : '未找到'}`);
  await sleep(1000);

  // 点击填充按钮
  const fillClicked = await page.evaluate(() => {
    const btn = document.getElementById('rh-btn-fill');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log(`填充按钮: ${fillClicked ? '已点击' : '未找到'}`);

  if (!fillClicked) {
    await screenshot(page, 'auto-error');
    await browser.close();
    return;
  }

  await sleep(2000);
  await screenshot(page, 'auto-03-filling');

  // 等待全自动填充完成
  console.log('等待全自动填充完成...');
  const startTime = Date.now();
  const maxWait = 600000; // 10分钟（含AI调用）
  let iter = 0;
  let lastHint = '';

  while (Date.now() - startTime < maxWait) {
    await sleep(2000);

    const status = await page.evaluate(() => {
      const el = document.getElementById('rh-status');
      return el ? el.textContent.trim() : '';
    });

    const hint = await page.evaluate(() => {
      const el = document.getElementById('rh-field-hint');
      return el && el.style.display !== 'none' ? el.textContent.trim().substring(0, 80) : '';
    });

    if (hint && hint !== lastHint) {
      console.log(`[${iter}] ${hint}`);
      lastHint = hint;
    }

    if (iter % 10 === 0) {
      await screenshot(page, `auto-fill-${String(iter).padStart(3, '0')}`);
    }

    if (/完成: 规则填充\d+项/.test(status) || /失败: /.test(status)) {
      console.log(`=== 填充流程结束: ${status.substring(0, 150)} ===`);
      break;
    }
    if (status.includes('共') && status.includes('项)')) {
      console.log(`=== 填充流程结束: ${status.substring(0, 150)} ===`);
      break;
    }

    iter++;
  }

  await screenshot(page, 'auto-04-final');

  // 获取debug日志
  // 先点击debug按钮展开日志
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
    const logPath = path.join(SCREENSHOT_DIR, 'auto-test-logs.txt');
    fs.writeFileSync(logPath, logs);
    console.log(`日志已保存到: ${logPath}`);

    // 输出关键日志行（下拉框相关）
    const lines = logs.split('\n');
    console.log('\n=== 下拉框相关日志 ===');
    lines.forEach(line => {
      if (line.includes('dropdown') || line.includes('下拉') ||
          line.includes('fillDropdown') || line.includes('选中') ||
          line.includes('选择') || line.includes('粘贴') ||
          line.includes('setNativeValue') || line.includes('tryClick') ||
          line.includes('验证') || line.includes('isDropdown')) {
        console.log(line);
      }
    });
  }

  console.log('\n=== 测试完成 ===');
  await browser.close();
}

main().catch(e => {
  console.error('失败:', e.message);
  process.exit(1);
});
