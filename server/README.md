# 简历投递助手 - 后端服务

## 概述

Flask 后端服务，为简历投递助手浏览器扩展提供：
- **密钥验证**：SQLite 数据库存储，支持使用统计和停用管理
- **规则匹配**：基于正则表达式的表单字段匹配引擎
- **AI 填充**：MiniMax-M2.5 模型，流式/非流式调用，带自动重试
- **日志收集**：按日期存储的 JSONL 日志

## 部署

### 环境要求
- Python 3.10+
- pip

### 安装
```bash
cd /opt/resume-backend
python3 -m venv venv
./venv/bin/pip install flask flask-cors requests
```

### 启动
```bash
cd /opt/resume-backend
nohup ./venv/bin/python app.py > nohup.out 2>&1 &
```

### 环境变量
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_SECRET` | 管理员密钥，用于密钥管理 API | `resume-admin-2026` |

## API 文档

### 公开接口
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查，返回 `{"status": "ok"}` |

### 需要密钥的接口（Authorization: Bearer \<key\>）
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/verify` | POST | 验证密钥有效性 |
| `/api/fill` | POST | 表单填充（规则匹配 + AI） |
| `/api/logs` | GET | 获取日志 |
| `/api/logs` | POST | 提交日志 |
| `/api/logs/latest` | GET | 获取最新日志 |

### 管理接口（X-Admin-Key: \<admin_secret\>）
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/keys` | GET | 列出所有密钥 |
| `/api/keys` | POST | 创建新密钥，body: `{"name": "备注"}` |
| `/api/keys/<key>` | DELETE | 停用指定密钥 |
| `/api/ai-config` | GET | 查看 AI 配置（key 隐藏） |
| `/api/ai-config` | POST | 更新 AI 配置 |

### 填充接口详解

**POST /api/fill**

请求：
```json
{
  "fields": [
    {
      "tag": "input",
      "type": "text",
      "label": "姓名",
      "name": "name",
      "className": "...",
      "placeholder": "请输入姓名",
      "readOnly": false,
      "options": [],
      "context": "基本信息",
      "nearby": "...",
      "parentText": "..."
    }
  ],
  "resumeData": {
    "basic": { "name": "张三", "phone": "13800138000", ... },
    "education": [{ "school": "...", "major": "...", ... }],
    "work": [{ "company": "...", "position": "...", ... }],
    "projects": [{ "name": "...", "description": "...", ... }]
  }
}
```

响应：
```json
{
  "success": true,
  "fills": { "0": "张三", "2": "13800138000" },
  "logs": [...],
  "matchedCount": 15,
  "totalFields": 20
}
```

## 密钥管理工具

```bash
# 创建新密钥
python generate_key.py create --name "用户备注"

# 列出所有密钥
python generate_key.py list

# 停用密钥
python generate_key.py deactivate rh-xxxxx

# 查看使用统计
python generate_key.py stats
```

## 数据存储

| 路径 | 说明 |
|------|------|
| `data/resume_helper.db` | SQLite 数据库（密钥表） |
| `data/ai_config.json` | AI 模型配置 |
| `data/logs/*.jsonl` | 按日期的填充日志 |

### 数据库表结构

```sql
CREATE TABLE api_keys (
    key TEXT PRIMARY KEY,       -- 密钥（rh-开头 + 32位hex）
    name TEXT DEFAULT 'unnamed', -- 名称/备注
    created TEXT NOT NULL,       -- 创建时间（ISO 8601）
    active INTEGER DEFAULT 1,   -- 是否有效（1/0）
    last_used TEXT,              -- 最后使用时间
    usage_count INTEGER DEFAULT 0 -- 使用次数
);
```

## 架构流程

```
浏览器扩展                    后端服务 (j1900:5000)
┌─────────┐                  ┌─────────────────┐
│content.js│                  │                 │
│  扫描字段 │                  │  密钥验证       │
│  规则匹配 │                  │  ↓              │
│  填充字段 │                  │  规则匹配(补充) │
│  ↓       │   AI_FILL        │  ↓              │
│background├─────────────────→│  AI 调用        │
│  .js     │   /api/fill      │  (MiniMax-M2.5) │
│          │←─────────────────│  ↓              │
│  应用结果 │   fills          │  返回填充结果   │
└─────────┘                  └─────────────────┘
```
