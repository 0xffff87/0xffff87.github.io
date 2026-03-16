/**
 * 简历投递助手 - Popup 主逻辑
 * 管理用户个人信息的录入、存储与一键填写触发
 */

// ========== 工具函数 ==========

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => { toast.className = 'toast'; }, 2500);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ========== 动态条目模板 ==========

function createEducationCard(data = {}) {
  const id = data.id || generateId();
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = id;
  card.innerHTML = `
    <button class="btn-remove" title="删除">×</button>
    <div class="form-group">
      <label>学校名称</label>
      <input type="text" class="edu-school" value="${data.school || ''}" placeholder="请输入学校名称">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>学历</label>
        <select class="edu-degree">
          <option value="">请选择</option>
          <option value="博士" ${data.degree === '博士' ? 'selected' : ''}>博士</option>
          <option value="硕士" ${data.degree === '硕士' ? 'selected' : ''}>硕士</option>
          <option value="本科" ${data.degree === '本科' ? 'selected' : ''}>本科</option>
          <option value="大专" ${data.degree === '大专' ? 'selected' : ''}>大专</option>
          <option value="高中" ${data.degree === '高中' ? 'selected' : ''}>高中</option>
        </select>
      </div>
      <div class="form-group">
        <label>专业</label>
        <input type="text" class="edu-major" value="${data.major || ''}" placeholder="请输入专业">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>入学时间</label>
        <input type="month" class="edu-start" value="${data.startDate || ''}">
      </div>
      <div class="form-group">
        <label>毕业时间</label>
        <input type="month" class="edu-end" value="${data.endDate || ''}">
      </div>
    </div>
    <div class="form-group">
      <label>GPA / 排名</label>
      <input type="text" class="edu-gpa" value="${data.gpa || ''}" placeholder="如：3.8/4.0 或 前10%">
    </div>
    <div class="form-group">
      <label>主要课程及成绩（选填）</label>
      <textarea class="edu-courses" rows="2" placeholder="如：数据结构(95) 算法设计(90) 操作系统(88)">${data.courses || ''}</textarea>
    </div>
    <div class="form-group">
      <label>在校经历（选填）</label>
      <textarea class="edu-desc" rows="2" placeholder="社团活动、学生干部等">${data.description || ''}</textarea>
    </div>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => card.remove());
  return card;
}

function createExperienceCard(data = {}) {
  const id = data.id || generateId();
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = id;
  card.innerHTML = `
    <button class="btn-remove" title="删除">×</button>
    <div class="form-group">
      <label>公司/单位名称</label>
      <input type="text" class="exp-company" value="${data.company || ''}" placeholder="请输入公司或单位名称">
    </div>
    <div class="form-group">
      <label>职位</label>
      <input type="text" class="exp-position" value="${data.position || ''}" placeholder="请输入职位名称">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>开始时间</label>
        <input type="month" class="exp-start" value="${data.startDate || ''}">
      </div>
      <div class="form-group">
        <label>结束时间</label>
        <input type="month" class="exp-end" value="${data.endDate || ''}">
      </div>
    </div>
    <div class="form-group">
      <label>工作描述</label>
      <textarea class="exp-desc" rows="3" placeholder="描述主要工作内容、业绩成果等">${data.description || ''}</textarea>
    </div>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => card.remove());
  return card;
}

function createProjectCard(data = {}) {
  const id = data.id || generateId();
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = id;
  card.innerHTML = `
    <button class="btn-remove" title="删除">×</button>
    <div class="form-group">
      <label>项目名称</label>
      <input type="text" class="proj-name" value="${data.name || ''}" placeholder="请输入项目名称">
    </div>
    <div class="form-group">
      <label>担任角色</label>
      <input type="text" class="proj-role" value="${data.role || ''}" placeholder="如：项目负责人、核心开发">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>开始时间</label>
        <input type="month" class="proj-start" value="${data.startDate || ''}">
      </div>
      <div class="form-group">
        <label>结束时间</label>
        <input type="month" class="proj-end" value="${data.endDate || ''}">
      </div>
    </div>
    <div class="form-group">
      <label>技术栈</label>
      <input type="text" class="proj-tech" value="${data.techStack || ''}" placeholder="如：Python, PyTorch, React">
    </div>
    <div class="form-group">
      <label>项目描述</label>
      <textarea class="proj-desc" rows="3" placeholder="描述项目背景、你的职责和成果">${data.description || ''}</textarea>
    </div>
    <div class="form-group">
      <label>项目链接（选填）</label>
      <input type="text" class="proj-link" value="${data.link || ''}" placeholder="如：GitHub地址或演示链接">
    </div>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => card.remove());
  return card;
}

function createAwardCard(data = {}) {
  const id = data.id || generateId();
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.dataset.id = id;
  card.innerHTML = `
    <button class="btn-remove" title="删除">×</button>
    <div class="form-group">
      <label>奖项名称</label>
      <input type="text" class="award-name" value="${data.name || ''}" placeholder="如：国家奖学金">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>获奖时间</label>
        <input type="month" class="award-date" value="${data.date || ''}">
      </div>
      <div class="form-group">
        <label>级别</label>
        <select class="award-level">
          <option value="">请选择</option>
          <option value="国家级" ${data.level === '国家级' ? 'selected' : ''}>国家级</option>
          <option value="省级" ${data.level === '省级' ? 'selected' : ''}>省级</option>
          <option value="市级" ${data.level === '市级' ? 'selected' : ''}>市级</option>
          <option value="校级" ${data.level === '校级' ? 'selected' : ''}>校级</option>
          <option value="院级" ${data.level === '院级' ? 'selected' : ''}>院级</option>
          <option value="其他" ${data.level === '其他' ? 'selected' : ''}>其他</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>描述（选填）</label>
      <input type="text" class="award-desc" value="${data.description || ''}" placeholder="简要描述">
    </div>
  `;
  card.querySelector('.btn-remove').addEventListener('click', () => card.remove());
  return card;
}

// ========== 数据收集与加载 ==========

function collectAllData() {
  const data = {
    basic: {
      name: document.getElementById('name').value,
      gender: document.getElementById('gender').value,
      birthday: document.getElementById('birthday').value,
      phone: document.getElementById('phone').value,
      email: document.getElementById('email').value,
      ethnicity: document.getElementById('ethnicity').value,
      political: document.getElementById('political').value,
      hometown: document.getElementById('hometown').value,
      address: document.getElementById('address').value,
      idcard: document.getElementById('idcard').value,
      currentCountry: document.getElementById('currentCountry').value,
      currentCity: document.getElementById('currentCity').value,
      targetCountry: document.getElementById('targetCountry').value,
      targetCity: document.getElementById('targetCity').value,
      targetPosition: document.getElementById('targetPosition').value,
      expectedSalary: document.getElementById('expectedSalary').value,
      summary: document.getElementById('summary').value,
    },
    education: [],
    experience: [],
    projects: [],
    awards: [],
    skills: document.getElementById('skills').value,
    courses: document.getElementById('courses').value,
    certificates: document.getElementById('certificates').value,
    languages: document.getElementById('languages').value,
    hobbies: document.getElementById('hobbies').value,
  };

  document.querySelectorAll('#education-list .entry-card').forEach(card => {
    data.education.push({
      id: card.dataset.id,
      school: card.querySelector('.edu-school').value,
      degree: card.querySelector('.edu-degree').value,
      major: card.querySelector('.edu-major').value,
      startDate: card.querySelector('.edu-start').value,
      endDate: card.querySelector('.edu-end').value,
      gpa: card.querySelector('.edu-gpa').value,
      courses: card.querySelector('.edu-courses').value,
      description: card.querySelector('.edu-desc').value,
    });
  });

  document.querySelectorAll('#experience-list .entry-card').forEach(card => {
    data.experience.push({
      id: card.dataset.id,
      company: card.querySelector('.exp-company').value,
      position: card.querySelector('.exp-position').value,
      startDate: card.querySelector('.exp-start').value,
      endDate: card.querySelector('.exp-end').value,
      description: card.querySelector('.exp-desc').value,
    });
  });

  document.querySelectorAll('#project-list .entry-card').forEach(card => {
    data.projects.push({
      id: card.dataset.id,
      name: card.querySelector('.proj-name').value,
      role: card.querySelector('.proj-role').value,
      startDate: card.querySelector('.proj-start').value,
      endDate: card.querySelector('.proj-end').value,
      techStack: card.querySelector('.proj-tech').value,
      description: card.querySelector('.proj-desc').value,
      link: card.querySelector('.proj-link').value,
    });
  });

  document.querySelectorAll('#awards-list .entry-card').forEach(card => {
    data.awards.push({
      id: card.dataset.id,
      name: card.querySelector('.award-name').value,
      date: card.querySelector('.award-date').value,
      level: card.querySelector('.award-level').value,
      description: card.querySelector('.award-desc').value,
    });
  });

  return data;
}

function loadData(data) {
  if (!data) return;

  if (data.basic) {
    const b = data.basic;
    document.getElementById('name').value = b.name || '';
    document.getElementById('gender').value = b.gender || '';
    document.getElementById('birthday').value = b.birthday || '';
    document.getElementById('phone').value = b.phone || '';
    document.getElementById('email').value = b.email || '';
    document.getElementById('ethnicity').value = b.ethnicity || '';
    document.getElementById('political').value = b.political || '';
    document.getElementById('hometown').value = b.hometown || '';
    document.getElementById('address').value = b.address || '';
    document.getElementById('idcard').value = b.idcard || '';
    document.getElementById('currentCountry').value = b.currentCountry || '';
    document.getElementById('currentCity').value = b.currentCity || '';
    document.getElementById('targetCountry').value = b.targetCountry || '';
    document.getElementById('targetCity').value = b.targetCity || '';
    document.getElementById('targetPosition').value = b.targetPosition || '';
    document.getElementById('expectedSalary').value = b.expectedSalary || '';
    document.getElementById('summary').value = b.summary || '';
  }

  const eduList = document.getElementById('education-list');
  eduList.innerHTML = '';
  if (data.education && data.education.length > 0) {
    data.education.forEach(edu => eduList.appendChild(createEducationCard(edu)));
  }

  const expList = document.getElementById('experience-list');
  expList.innerHTML = '';
  if (data.experience && data.experience.length > 0) {
    data.experience.forEach(exp => expList.appendChild(createExperienceCard(exp)));
  }

  const projList = document.getElementById('project-list');
  projList.innerHTML = '';
  if (data.projects && data.projects.length > 0) {
    data.projects.forEach(proj => projList.appendChild(createProjectCard(proj)));
  }

  const awardList = document.getElementById('awards-list');
  awardList.innerHTML = '';
  if (data.awards && data.awards.length > 0) {
    data.awards.forEach(award => awardList.appendChild(createAwardCard(award)));
  }

  document.getElementById('skills').value = data.skills || '';
  document.getElementById('courses').value = data.courses || '';
  document.getElementById('certificates').value = data.certificates || '';
  document.getElementById('languages').value = data.languages || '';
  document.getElementById('hobbies').value = data.hobbies || '';
}

// ========== 示例数据 ==========

function getSampleData() {
  return {
    basic: {
      name: '张明远',
      gender: '男',
      birthday: '2000-06-15',
      phone: '13800138000',
      email: 'zhangmingyuan@example.com',
      ethnicity: '汉族',
      political: '共青团员',
      hometown: '山东省济南市',
      address: '山东省济南市历下区经十路88号',
      idcard: '370102200006150012',
      currentCountry: '中国',
      currentCity: '济南',
      targetCountry: '中国',
      targetCity: '北京、上海、杭州',
      targetPosition: '后端开发工程师',
      expectedSalary: '18k-30k',
      industry: '互联网/IT',
      workExperience: '无工作经验',
      summary: '计算机科学与技术专业应届硕士毕业生，具备扎实的编程基础和丰富的项目实践经验。在校期间主要研究方向为自然语言处理和大模型应用，曾在知名互联网公司完成实习，具备良好的团队协作能力和快速学习能力。期望从事后端开发或AI相关岗位。',
    },
    education: [
      {
        school: '山东大学',
        degree: '硕士',
        major: '计算机科学与技术',
        startDate: '2023-09',
        endDate: '2026-06',
        gpa: '3.7/4.0',
        courses: '高级算法设计(92) 机器学习(95) 自然语言处理(93) 分布式系统(88)',
        description: '研究方向：自然语言处理。参与导师科研项目2项，发表EI论文1篇。担任研究生会技术部部长。',
      },
      {
        school: '济南大学',
        degree: '本科',
        major: '软件工程',
        startDate: '2019-09',
        endDate: '2023-06',
        gpa: '3.5/4.0，专业前15%',
        courses: '数据结构(95) 算法设计与分析(90) 操作系统(88) 计算机网络(85) 数据库原理(92) 编译原理(87)',
        description: '主修课程优异，曾获校级二等奖学金3次。担任ACM算法协会副会长。',
      },
    ],
    experience: [
      {
        company: '字节跳动',
        position: '后端开发实习生',
        startDate: '2025-06',
        endDate: '2025-09',
        description: '参与内容推荐系统后端服务开发，使用Go语言和微服务架构。负责用户画像数据处理模块的优化，将接口响应时间降低了40%。参与了代码评审和技术方案设计。',
      },
      {
        company: '浪潮集团',
        position: '软件开发实习生',
        startDate: '2024-07',
        endDate: '2024-10',
        description: '参与企业级云平台前后端开发，使用Java/Spring Boot框架。独立完成用户权限管理模块的设计与实现，编写单元测试和接口文档。',
      },
    ],
    projects: [
      {
        name: '基于大模型的智能简历解析系统',
        role: '项目负责人',
        startDate: '2025-03',
        endDate: '2025-12',
        techStack: 'Python, PyTorch, FastAPI, React, MySQL',
        description: '设计并实现了一个基于大语言模型的简历智能解析系统，支持PDF/Word格式简历的自动解析和结构化提取。使用微调后的LLM模型实现了95%以上的字段识别准确率，系统已在校内就业中心试用。',
        link: 'https://github.com/zhangmy/resume-parser',
      },
      {
        name: '分布式任务调度平台',
        role: '核心开发',
        startDate: '2024-09',
        endDate: '2025-01',
        techStack: 'Go, gRPC, Redis, Docker, Kubernetes',
        description: '参与设计和开发分布式任务调度平台，支持定时任务、延迟任务和工作流编排。负责调度器核心模块和监控告警子系统的开发，支撑日均10万+任务的稳定调度。',
        link: '',
      },
    ],
    awards: [
      {
        name: '中国研究生数学建模竞赛二等奖',
        date: '2024-11',
        level: '国家级',
        description: '负责算法建模和论文撰写',
      },
      {
        name: '山东省"互联网+"大学生创新创业大赛银奖',
        date: '2022-08',
        level: '省级',
        description: 'AI辅助教育项目，担任技术负责人',
      },
      {
        name: '校级优秀学生干部',
        date: '2024-06',
        level: '校级',
        description: '',
      },
    ],
    skills: '编程语言：熟练掌握 Python、Java、Go，了解 C/C++、JavaScript\n框架与工具：Spring Boot、Django、Flask、PyTorch、Docker、Git\n数据库：MySQL、Redis、MongoDB\n其他：Linux操作系统、RESTful API设计、微服务架构',
    courses: '数据结构(95) 算法设计与分析(90) 操作系统(88) 计算机网络(85) 数据库原理(92) 编译原理(87) 机器学习(95) 自然语言处理(93)',
    certificates: 'CET-6 560分\n计算机技术与软件专业技术资格（软件设计师）\n普通话二级甲等',
    languages: '普通话（母语）\n英语（CET-6 560分，能流利阅读英文技术文档）',
    hobbies: '篮球、技术博客写作、开源项目贡献、阅读',
  };
}

// ========== 初始化 ==========

document.addEventListener('DOMContentLoaded', () => {
  // 标签页切换
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // 添加条目按钮
  document.getElementById('btn-add-edu').addEventListener('click', () => {
    document.getElementById('education-list').appendChild(createEducationCard());
  });

  document.getElementById('btn-add-exp').addEventListener('click', () => {
    document.getElementById('experience-list').appendChild(createExperienceCard());
  });

  document.getElementById('btn-add-proj').addEventListener('click', () => {
    document.getElementById('project-list').appendChild(createProjectCard());
  });

  document.getElementById('btn-add-award').addEventListener('click', () => {
    document.getElementById('awards-list').appendChild(createAwardCard());
  });

  // 保存按钮
  document.getElementById('btn-save').addEventListener('click', () => {
    const data = collectAllData();
    if (!data.basic.name) {
      showToast('请至少填写姓名', 'error');
      return;
    }
    chrome.storage.local.set({ resumeData: data }, () => {
      showToast('信息已保存', 'success');
    });
  });

  // 一键填写按钮
  document.getElementById('btn-fill').addEventListener('click', async () => {
    const data = collectAllData();
    if (!data.basic.name) {
      showToast('请先填写并保存个人信息', 'error');
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        showToast('无法获取当前标签页', 'error');
        return;
      }

      showToast('正在分析页面表单...', 'info');

      chrome.tabs.sendMessage(tab.id, {
        action: 'START_FILL',
        resumeData: data
      }, (response) => {
        if (chrome.runtime.lastError) {
          showToast('请刷新页面后重试', 'error');
          return;
        }
        if (response && response.success) {
          showToast('填写完成！请检查结果', 'success');
        } else {
          showToast(response?.message || '填写失败，请重试', 'error');
        }
      });
    } catch (err) {
      showToast('操作失败: ' + err.message, 'error');
    }
  });

  // 加载示例数据按钮
  document.getElementById('btn-demo').addEventListener('click', () => {
    const sampleData = getSampleData();
    loadData(sampleData);
    chrome.storage.local.set({ resumeData: sampleData }, () => {
      showToast('示例数据已加载并保存', 'success');
    });
  });

  // 设置按钮
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 在线编辑（打开网页版）
  document.getElementById('btn-online').addEventListener('click', () => {
    // 用户部署后，将此 URL 替换为实际的网页地址
    // 例如：https://yourusername.github.io/resume-helper/website/
    const onlineUrl = 'https://0xffff87.github.io/-/website/';
    chrome.tabs.create({ url: onlineUrl });
  });

  // 导出简历数据
  document.getElementById('btn-export').addEventListener('click', () => {
    const data = collectAllData();
    if (!data.basic.name) {
      showToast('没有可导出的数据', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `简历数据_${data.basic.name}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('简历数据已导出', 'success');
  });

  // 导入简历数据
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.basic || !data.basic.name) {
          showToast('文件格式不正确，缺少基本信息', 'error');
          return;
        }
        loadData(data);
        chrome.storage.local.set({ resumeData: data }, () => {
          showToast('简历数据已导入', 'success');
        });
      } catch (err) {
        showToast('文件解析失败: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // 清空数据
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('确定要清空所有已填写的简历数据吗？此操作不可恢复。')) return;
    chrome.storage.local.remove('resumeData', () => {
      loadData({
        basic: {}, education: [], experience: [], projects: [], awards: [],
        skills: '', courses: '', certificates: '', languages: '', hobbies: '',
      });
      showToast('数据已清空', 'info');
    });
  });

  // 加载已保存的数据
  chrome.storage.local.get('resumeData', (result) => {
    if (result.resumeData) {
      loadData(result.resumeData);
    }
  });
});
