
# md2flomo

一个将 [Obsidian](https://obsidian.md/) 笔记一键发送到 [flomo](https://flomoapp.com/) 的插件。  
支持标签解析、内容清理、批量发布，帮助你将 Obsidian 的内容快速同步到 flomo。

---

## ✨ 功能特性

- 🔑 在插件设置中配置 flomo API Token  
- ✅ 测试 API 是否可用（测试发送功能）  
- 📝 单篇笔记上传至 flomo  
- 📌 侧边栏小图标：点击即可发送当前笔记  
- 🏷️ 将 frontmatter 中 `tags` 转换为 flomo 标签  
- 📂 内容样式：  
	- 标题加粗  
	- 文件正文内容 
	- 文件别名显示在底部
	- 标签展示在内容下方  
- 🎈 批量发布后台
- 📊 发布后台状态管理：  
	 - 已发送 → `published`  
	- 未发送 → `unpublished`  

---

## 🚀 安装

### 手动安装

1. 下载最新的 `md2flomo.zip` 插件包  
2. 进入 Obsidian 设置，选择【第三方插件】，关闭【安全模式】  
3. 点击【加载本地插件】，选择下载的 `md2flomo.zip` 文件  
4. 启用插件

### 在插件市场安装
> 目前还在审核中。

1. 进入 Obsidian 设置，选择【第三方插件】，关闭【安全模式】，浏览社区插件
2. 在社区插件中搜索 `md2flomo`，点击安装并启用。

---

## ⚙️ 使用方法

1. 在 **设置 → 插件设置** 中输入 flomo API Token  
2. 点击「发送测试内容」确认连接成功  
3. 打开任意笔记，点击右侧栏图标 → 即可发送到 flomo  
4. 在插件后台可查看：  
	- `published`：已发送笔记  
	- `unpublished`：未发送笔记  

---

## 🛠️ 开发规划

- v 0.4.3: 最小可用版本、Obsidian 插件市场上线  
- v 0.4.0: 格式优化、链接清理、上传反馈  
- v 0.5.0: 设置界面优化、上传历史记录、错误提示  
- v 1.0.0: 批量上传、UI 美化、国际化、多语言支持

详细版本更新见 👉 [CHANGELOG](./CHNANGELOG.md)

---

## 📸 使用截图

### 单篇发布
- 点击侧边栏发布按钮（小飞机图标）
- 使用命令栏发布

![](https://joey-md-asset.oss-cn-hangzhou.aliyuncs.com/img/202508311619272.png)

如果 `send-flomo` 状态为 `false`，点击发布后会确认内容，确认后此状态会更新为 `true`。

![](./assets/md2flomo-sendstatus.gif)

#### 去除格式效果

![](./assets/md2flomo-sendcard-clean.gif)

#### 发布后台状态修复

![](./assets/md2flomo-pub-status.gif)

### 批量发布

![](./assets/md2flomo-sendnotes.gif)


---

## 🤝 贡献

欢迎提交 PR 或 Issue 来帮助改进此插件。  
本项目遵循 [MIT License](./LICENSE)。  

---

## 📬 联系方式

- 作者：@joeytoday 
- 邮箱： joeytoday247@outlook.com 
