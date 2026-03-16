# 网页部署指南 & Google AdSense 配置

## 问题：为什么需要部署网页？

Chrome 浏览器插件没有公开可访问的 URL（它的地址是 `chrome-extension://xxx/...`，外部无法访问）。
Google AdSense 要求你提供一个**公开可访问的网址**来注册。

**解决方案**：将 `website/` 文件夹部署为一个独立的公开网站，用这个网站的 URL 注册 Google AdSense。

---

## 第一步：部署到 GitHub Pages（免费）

### 1. 创建 GitHub 仓库

1. 打开 https://github.com/new
2. 仓库名称填写 `resume-helper`（或你喜欢的名称）
3. 选择 **Public**（必须公开才能使用 GitHub Pages）
4. 点击 **Create repository**

### 2. 上传代码

在本项目根目录执行：

```bash
git init
git add .
git commit -m "初始化简历投递助手项目"
git remote add origin https://github.com/你的用户名/resume-helper.git
git branch -M main
git push -u origin main
```

### 3. 启用 GitHub Pages

1. 进入仓库页面 → **Settings** → 左侧菜单 **Pages**
2. Source 选择 **Deploy from a branch**
3. Branch 选择 `main`，文件夹选择 `/ (root)`
4. 点击 **Save**

### 4. 访问你的网站

等待 1-2 分钟后，你的网站地址为：

```
https://你的用户名.github.io/resume-helper/website/
```

例如：`https://zhangsan.github.io/resume-helper/website/`

---

## 第二步：配置 Google AdSense

### 1. 注册 Google AdSense

1. 打开 https://www.google.com/adsense/
2. 点击「开始使用」
3. 填入你的网站 URL：`https://你的用户名.github.io/resume-helper/website/`
4. 按照指引完成注册

### 2. 获取你的发布商 ID

注册成功后，你会获得一个发布商 ID，格式如：`ca-pub-1234567890123456`

### 3. 替换代码中的占位符

打开 `website/index.html`，全局替换以下内容：

| 查找 | 替换为 |
|------|--------|
| `ca-pub-XXXXXXXXXXXXXXXX` | 你的发布商 ID（如 `ca-pub-1234567890123456`） |
| `YOUR_AD_SLOT_1` | 你的广告单元 ID（顶部横幅） |
| `YOUR_AD_SLOT_2` | 你的广告单元 ID（文章间 1） |
| `YOUR_AD_SLOT_3` | 你的广告单元 ID（文章间 2） |
| `YOUR_AD_SLOT_4` | 你的广告单元 ID（侧栏 1） |
| `YOUR_AD_SLOT_5` | 你的广告单元 ID（侧栏 2） |
| `YOUR_AD_SLOT_6` | 你的广告单元 ID（底部横幅） |

### 4. 创建广告单元

在 AdSense 后台：
1. 进入 **广告** → **按广告单元** → **创建新广告单元**
2. 建议创建以下类型：
   - **展示广告**（横幅）：用于顶部和底部
   - **信息流内嵌广告**：用于表单区块之间
   - **展示广告**（方形）：用于侧栏
3. 每创建一个，记下 `data-ad-slot` 的值，填入 `index.html` 对应位置

### 5. 重新部署

修改完成后：

```bash
git add .
git commit -m "配置 Google AdSense"
git push
```

GitHub Pages 会自动更新，几分钟后广告即可生效。

---

## 第三步：更新插件中的在线编辑链接

打开 `popup/popup.js`，找到「在线编辑」的 URL，替换为你的实际网址：

```javascript
const onlineUrl = 'https://你的用户名.github.io/resume-helper/website/';
```

---

## 其他部署选项

如果你不想使用 GitHub Pages，也可以选择：

| 平台 | 费用 | 说明 |
|------|------|------|
| **Vercel** | 免费 | https://vercel.com，导入 GitHub 仓库即可 |
| **Netlify** | 免费 | https://netlify.com，拖拽上传或连接 Git |
| **Cloudflare Pages** | 免费 | https://pages.cloudflare.com |
| **自有服务器** | 视情况 | 将 `website/` 目录放到任意 Web 服务器即可 |

---

## 注意事项

1. **AdSense 审核**：Google 会审核你的网站内容，确保有足够的原创内容和正常的用户体验
2. **内容要求**：网站需要有实质性内容（功能介绍、FAQ、使用说明等都算）
3. **流量要求**：新网站可能需要积累一定访问量后才能通过审核
4. **政策限制**：Google AdSense **不允许**在浏览器插件内部放置广告，只能放在公开网页上
