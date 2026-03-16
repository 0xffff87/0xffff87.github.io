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
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const pageLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    pageLogs.push(text);
    if (text.includes('简历助手')) console.log('[PAGE] ' + text);
  });
  page.on('pageerror', err => console.log('[PAGE ERROR] ' + err.message));

  const sites = [
    'https://talent.baidu.com/jobs/list',
    'https://careers.tencent.com/',
    'https://www.baidu.com',
  ];

  const scriptContent = fs.readFileSync('/opt/resume-ext-test/resume-helper.user.js', 'utf8');
  const cleanScript = scriptContent.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/, '');

  for (const url of sites) {
    console.log('\n=== 测试: ' + url + ' ===');
    pageLogs.length = 0;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } catch(e) {
      console.log('页面加载超时或失败: ' + e.message.substring(0, 80));
    }
    await sleep(2000);

    await page.evaluate(() => {
      const gmStore = {};
      window.GM_getValue = (key, defaultVal) => gmStore[key] !== undefined ? gmStore[key] : defaultVal;
      window.GM_setValue = (key, val) => { gmStore[key] = val; };
      window.GM_addStyle = (css) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
      window.GM_registerMenuCommand = () => {};
      window.GM_setClipboard = () => {};
    });

    try {
      await page.evaluate(cleanScript);
    } catch(e) {
      console.log('脚本注入失败: ' + e.message.substring(0, 150));
      continue;
    }
    await sleep(1500);

    const fabExists = await page.evaluate(() => !!document.getElementById('resume-helper-fab'));
    console.log('FAB 按钮存在: ' + fabExists);

    const hasInitLog = pageLogs.some(l => l.includes('脚本开始执行'));
    const hasFabLog = pageLogs.some(l => l.includes('FAB已创建'));
    console.log('初始化日志: ' + hasInitLog + ', FAB创建日志: ' + hasFabLog);

    const safeName = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    await page.screenshot({ path: '/opt/resume-ext-test/screenshots/real-' + safeName + '.png', fullPage: false });
    console.log('截图已保存');
  }

  await browser.close();
})();
