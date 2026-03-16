/**
 * 简历投递助手 - Background Service Worker
 * 作为插件和后端服务之间的通信代理
 */

async function getBackendConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get('backendConfig', (result) => {
      resolve(result.backendConfig || { serverUrl: '', pluginKey: '' });
    });
  });
}

// ========== AI 配置与填充 ==========

const DEFAULT_AI_CONFIG = {
  endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
  apiKey: 'sk-qqrfmjpunjhxtxuxqfhcxreoppndojhgzhbjqpkwqtizgiao',
  model: 'Qwen/Qwen2.5-VL-72B-Instruct',
};

async function getAiConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get('aiConfig', (result) => {
      resolve({ ...DEFAULT_AI_CONFIG, ...(result.aiConfig || {}) });
    });
  });
}

async function saveAiConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ aiConfig: config }, resolve);
  });
}

function extractJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  let s = text.trim();
  const codeBlockMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) s = codeBlockMatch[1].trim();
  const braceStart = s.indexOf('{');
  const braceEnd = s.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) s = s.slice(braceStart, braceEnd + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    try {
      s = s.replace(/,(\s*[}\]])/g, '$1').replace(/(['"])?([a-zA-Z_][a-zA-Z0-9_]*)(['"])?\s*:/g, '"$2": ');
      return JSON.parse(s);
    } catch (e2) {
      return null;
    }
  }
}

async function callAIFill(screenshotDataUrl, unfilledFields, resumeData, pageUrl) {
  const config = await getAiConfig();
  if (!config.endpoint || !config.apiKey) {
    throw new Error('请先在设置中配置 AI 接口地址和 API Key');
  }

  const fieldsDesc = unfilledFields.map((f, i) => {
    let desc = `f_${i}(字段索引${f.index}): label="${f.label || '无'}" type="${f.type || 'text'}"`;
    if (f.context) desc += ` context="${(f.context || '').substring(0, 60)}"`;
    if (f.nearby) desc += ` nearby="${(f.nearby || '').substring(0, 60)}"`;
    if (f.parentText) desc += ` parent="${(f.parentText || '').substring(0, 60)}"`;
    if (f.options && f.options.length) {
      const optTexts = f.options.slice(0, 20).map(o => typeof o === 'object' ? (o.text || o.value || '') : String(o));
      desc += ` options=[${optTexts.join(',')}]`;
    }
    return desc;
  }).join('\n');

  const basicInfo = resumeData.basic || {};
  const resumeCompact = JSON.stringify({
    basic: basicInfo,
    education: (resumeData.education || [])[0] || {},
    work: (resumeData.work || resumeData.experience || [])[0] || {},
    project: (resumeData.projects || [])[0] || {},
    awards: resumeData.awards || [],
    languages: resumeData.languages || basicInfo.languages || null,
    summary: basicInfo.summary || resumeData.summary || '',
  }, null, 0);

  const systemPrompt = '你是简历表单自动填写工具。根据提供的截图和表单字段信息，结合简历数据，为每个未填写的字段提供合适的值。\n' +
    '要求：\n' +
    '1. select/dropdown类型的字段必须使用选项中存在的文本值\n' +
    '2. 年份填数字如2023，月份填1-12的数字\n' +
    '3. 无法确定的字段不要填写（不要在fills中出现）\n' +
    '4. 只输出JSON，格式：{"fills":[{"fieldId":"f_0","value":"填充值"},...]}\n' +
    '5. fieldId对应字段描述中的f_X标识\n' +
    '6. 不要输出<think>标签或思考过程';

  const userContent = [
    { type: 'text', text: `页面URL: ${pageUrl}\n\n简历数据:\n${resumeCompact}\n\n未填写的表单字段:\n${fieldsDesc}\n\n请根据截图中表单的实际情况和简历数据，为上述字段提供填充值。` },
  ];

  if (screenshotDataUrl) {
    userContent.push({ type: 'image_url', image_url: { url: screenshotDataUrl, detail: 'low' } });
  }

  const requestBody = JSON.stringify({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 4096,
  });

  const maxRetries = 2;
  const timeoutMs = 60000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: requestBody,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 429 && attempt < maxRetries) {
        console.warn(`[简历助手] AI接口429并发限制，${3 + attempt * 2}秒后重试...`);
        await new Promise(r => setTimeout(r, (3 + attempt * 2) * 1000));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`AI接口错误 (${response.status}): ${errText.slice(0, 200)}`);
      }

      const data = await response.json();
      const rawContent = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      console.log('[简历助手] AI原始响应:', rawContent.substring(0, 500));

      const parsed = extractJsonFromText(rawContent);
      if (!parsed || !parsed.fills || !Array.isArray(parsed.fills)) {
        throw new Error('AI返回格式无效: ' + rawContent.substring(0, 200));
      }

      const fills = {};
      for (const item of parsed.fills) {
        const fieldId = item.fieldId;
        const value = item.value;
        if (fieldId == null || value == null || value === '') continue;
        const localMatch = String(fieldId).match(/f_(\d+)/);
        if (!localMatch) continue;
        const localIdx = parseInt(localMatch[1]);
        if (localIdx >= 0 && localIdx < unfilledFields.length) {
          const globalIdx = unfilledFields[localIdx].index;
          fills[String(globalIdx)] = String(value);
        }
      }
      return { fills };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) {
          console.warn(`[简历助手] AI请求超时，重试中(${attempt + 1}/${maxRetries})...`);
          continue;
        }
        throw new Error('AI请求超时（60秒），已重试' + maxRetries + '次');
      }
      throw err;
    }
  }
}

async function submitLogs(logData) {
  const config = await getBackendConfig();
  if (!config.serverUrl || !config.pluginKey) return;
  try {
    const url = config.serverUrl.replace(/\/+$/, '') + '/api/logs';
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.pluginKey}`,
      },
      body: JSON.stringify(logData),
    });
  } catch (e) {
    console.warn('[简历助手] 日志上报失败:', e.message);
  }
}

// ========== 消息监听 ==========

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'KEEPALIVE') {
    sendResponse({ ok: true });
    return false;
  }

  if (message.action === 'VERIFY_KEY') {
    (async () => {
      try {
        const config = await getBackendConfig();
        if (!config.serverUrl || !config.pluginKey) {
          sendResponse({ success: false, error: '请先填写服务器地址和插件密钥' });
          return;
        }
        const url = config.serverUrl.replace(/\/+$/, '') + '/api/verify';
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.pluginKey}`,
          },
          body: JSON.stringify({ action: 'verify' }),
        });
        if (resp.ok) {
          sendResponse({ success: true });
        } else {
          const errText = await resp.text().catch(() => '');
          sendResponse({ success: false, error: `服务器返回 ${resp.status}: ${errText.slice(0, 100)}` });
        }
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }

  if (message.action === 'SUBMIT_LOGS') {
    submitLogs(message.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'AI_FILL') {
    callAIFill(
      message.screenshotDataUrl,
      message.unfilledFields || [],
      message.resumeData || {},
      message.pageUrl || ''
    )
      .then(result => sendResponse({ success: true, fills: result.fills }))
      .catch(error => {
        console.error('[简历助手] AI 填充失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    return true;
  }

  if (message.action === 'GET_AI_CONFIG') {
    getAiConfig().then(config => sendResponse({ success: true, config }));
    return true;
  }

  if (message.action === 'SAVE_AI_CONFIG') {
    saveAiConfig(message.config || {}).then(() => sendResponse({ success: true }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// 快捷键命令监听
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'fill-resume') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const resumeData = await new Promise(r => chrome.storage.local.get('resumeData', res => r(res.resumeData)));
        chrome.tabs.sendMessage(tab.id, { action: 'START_FILL', resumeData });
      }
    } catch (e) {
      console.warn('[简历助手] 快捷键触发失败:', e.message);
    }
  }
});

// 开发模式：自动检测文件变化并重载扩展
(function devAutoReload() {
  const DEV_SERVER = 'http://127.0.0.1:8765/reload-check';
  const checkReload = () => {
    fetch(DEV_SERVER, { method: 'GET' })
      .then(r => r.json())
      .then(data => {
        if (data.reload) {
          console.log('[简历助手] 检测到文件变化，自动重载扩展...');
          chrome.runtime.reload();
        }
      })
      .catch(() => {});
  };
  setInterval(checkReload, 3000);
})();
