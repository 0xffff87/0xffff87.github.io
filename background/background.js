/**
 * 简历投递助手 - Background Service Worker
 * AI 填充必须通过后端服务，后端通过密钥验证授权
 */

async function getBackendConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get('backendConfig', (result) => {
      resolve(result.backendConfig || { serverUrl: '', pluginKey: '' });
    });
  });
}

// ========== AI 配置（仅在无后端时使用的本地降级方案） ==========

const DEFAULT_AI_CONFIG = {
  endpoint: 'https://api.siliconflow.cn/v1/chat/completions',
  apiKey: '',
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

// ========== 通过后端调用 AI 填充 ==========

async function callBackendFill(unfilledFields, resumeData) {
  const config = await getBackendConfig();
  if (!config.serverUrl || !config.pluginKey) {
    throw new Error('请先在设置中配置后端服务器地址和插件密钥');
  }
  const url = config.serverUrl.replace(/\/+$/, '') + '/api/fill';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  const backendFields = unfilledFields.map(f => {
    const { index, ...rest } = f;
    return rest;
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.pluginKey}`,
      },
      body: JSON.stringify({ fields: backendFields, resumeData }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 403) {
      throw new Error('密钥验证失败，请检查插件密钥是否正确');
    }
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`后端服务错误 (${response.status}): ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || '后端返回失败');
    }

    const fills = {};
    for (const [idx, value] of Object.entries(data.fills || {})) {
      const i = parseInt(idx);
      if (i >= 0 && i < unfilledFields.length && unfilledFields[i].index != null) {
        fills[String(unfilledFields[i].index)] = value;
      }
    }

    return { fills, logs: data.logs || [] };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('后端请求超时（120秒）');
    }
    throw err;
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
    callBackendFill(
      message.unfilledFields || [],
      message.resumeData || {}
    )
      .then(result => sendResponse({ success: true, fills: result.fills, logs: result.logs }))
      .catch(error => {
        console.error('[简历助手] 后端 AI 填充失败:', error);
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

  if (message.action === 'openOptions') {
    chrome.runtime.openOptionsPage();
    return false;
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
