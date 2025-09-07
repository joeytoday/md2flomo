
# Changelog

所有对本项目的显著变更都将记录在此文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本控制遵循[语义化版本](https://semver.org/lang/zh-CN/).

## 0.4.3 - 2025-09-01
### Added
- [x] 插件设置中支持配置 flomo API Token ✅ 2025-08-31
- [x] 支持测试 API 通信（测试发送内容） ✅ 2025-08-31
- [x] 支持单篇笔记上传至 flomo ✅ 2025-08-31
- [x] 在侧边栏添加按钮，可快速发送当前笔记 ✅ 2025-08-31
- [x] 支持将 frontmatter 中 `tags` 转换为 flomo 标签 ✅ 2025-08-31
- [x] 内容上传样式优化： ✅ 2025-08-31
	- [ ] 标题加粗 （目前通过 API 发送的 markdown 格式 flomo 不识别）
	- [x] 文件正文内容 ✅ 2025-08-31
	- [x] 标签展示在内容下方 ✅ 2025-08-31
- [x] 后台状态管理： ✅ 2025-08-31
	- [x] 已发送内容 → `published` ✅ 2025-08-31
	- [x] 未发送内容 → `unpublished` ✅ 2025-08-31
- [x] 支持解析 frontmatter 中 `aliases`，追加到正文末尾 ✅ 2025-08-31
- [x] 批量发布到 flomo（🚨注意：flomo 一天最多只能通过 API 发送 100 条内容） ✅ 2025-08-31
- [x] 上传结果反馈：toast 提示（成功/失败） ✅ 2025-08-31
### Fixed
- [x] 修复发布后 `send-flomo` 状态不更新 ✅ 2025-08-31
- [x] 目前 flomo 通过 API 发送的内容不支持 markdown 格式识别，所以移除所有 markdown格式。 ✅ 2025-08-31
- [x] 修复单篇发布内容状态不在发布后台显示 ✅ 2025-08-31


### 效果演示

#### 未去除格式效果

![](./assets/md2flomo-sendcard.gif)

#### 去除格式效果

![](./assets/md2flomo-sendcard-clean.gif)

#### 发布后台状态修复

![](./assets/md2flomo-pub-status.gif)

#### 批量发布

![](./assets/md2flomo-sendnotes.gif)

## 0.5.2 - 2025-09-05

### Added
- [x] 【功能】获取日记内 block 内容，以双换行符切割 ✅ 2025-09-05
- [x] 给文内发布单独增加命令 ✅ 2025-09-05
- [x] 新增导入 block 功能按钮 ✅ 2025-09-05
- [x] 有完整 UI（配置 API Token 设置） ✅ 2025-09-05
- [x] 支持批量导入、日志提示（上传成功/失败） ✅ 2025-09-05
### Fixed
- [x] 修复 block 导入内容切分问题 ✅ 2025-09-05
- [x] 修复 block 导入多余换行 ✅ 2025-09-05
- [x] 错误提示优化：API Token 失效、网络错误、内容为空 ✅ 2025-09-05

### 效果演示

<img src="https://joey-md-asset.oss-cn-hangzhou.aliyuncs.com/img/202509051453220.png" style="zoom:30%;" />
