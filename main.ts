import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import * as yaml from 'js-yaml';

// 定义插件设置接口
interface Md2FlomoSettings {
    flomoApiUrl: string;
    publishedNotes: Record<string, { timestamp: number, contentHash: string }>;
    hasShownApiReminder: boolean;
}

// 默认设置
const DEFAULT_SETTINGS: Md2FlomoSettings = {
    flomoApiUrl: '', // 不使用真实默认的API，从配置页面获取
    publishedNotes: {}, // 用于存储已发布笔记的信息
    hasShownApiReminder: false
};

// 笔记项接口
interface NoteItem {
    file: TFile;
    content: string;
    tags: string[];
    sendFlomo: boolean;
    filePath: string;
    directoryPath: string;
    isPublished: boolean;
    aliases?: string | string[];
}

// 从YAML front matter中提取tags、send-flomo状态和aliases
function extractTagsFromFrontmatter(content: string): { tags: string[], sendFlomo: boolean, aliases?: string | string[] } {
    const tags: string[] = [];
    let sendFlomo = false;
    let aliases;
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (yamlMatch && yamlMatch[1]) {
        try {
            const frontmatter = yaml.load(yamlMatch[1]) as { 
                tags?: string[] | string; 
                'send-flomo'?: boolean;
                aliases?: string | string[]
            };
            if (frontmatter) {
                // 提取tags
                if (frontmatter.tags) {
                    if (typeof frontmatter.tags === 'string') {
                        tags.push(frontmatter.tags);
                    } else if (Array.isArray(frontmatter.tags)) {
                        tags.push(...frontmatter.tags);
                    }
                }
                
                // 提取send-flomo状态
                if (frontmatter['send-flomo'] === true) {
                    sendFlomo = true;
                }
                
                // 提取aliases
                if (frontmatter.aliases) {
                    aliases = frontmatter.aliases;
                }
            }
        } catch (e) {
            console.error('解析YAML时出错:', e);
        }
    }
    
    return { tags, sendFlomo, aliases };
}

// 移除YAML front matter
function removeFrontmatter(content: string): string {
    return content.replace(/^---\n([\s\S]*?)\n---\n/, '');
}

// 移除Markdown格式（加粗、斜体等）
function removeMarkdownFormatting(content: string): string {
    // 移除加粗格式 **内容**
    let cleanContent = content.replace(/\*\*(.*?)\*\*/g, '$1');
    // 移除斜体格式 *内容* 或 _内容_
    cleanContent = cleanContent.replace(/\*(.*?)\*/g, '$1');
    cleanContent = cleanContent.replace(/_(.*?)_/g, '$1');
    return cleanContent;
}

// 更新文件的YAML front matter中的send-flomo属性
async function updateSendFlomoStatus(app: App, file: TFile, isSent: boolean): Promise<boolean> {
    try {
        const content = await app.vault.read(file);
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        let updatedContent = content;
        
        if (yamlMatch && yamlMatch[1]) {
            // 已有frontmatter，更新其中的send-flomo属性
            const frontmatterContent = yamlMatch[1];
            let frontmatter;
            
            try {
                frontmatter = yaml.load(frontmatterContent) as Record<string, any>;
            } catch (e) {
                console.error('解析YAML时出错:', e);
                return false;
            }
            
            // 设置send-flomo属性
            frontmatter['send-flomo'] = isSent;
            
            // 重新生成YAML内容
            const updatedYaml = yaml.dump(frontmatter);
            updatedContent = content.replace(/^---\n([\s\S]*?)\n---/, `---\n${updatedYaml}---`);
        } else {
            // 没有frontmatter，添加新的frontmatter
            const frontmatter = { 'send-flomo': isSent };
            const yamlContent = yaml.dump(frontmatter);
            updatedContent = `---\n${yamlContent}---\n${content}`;
        }
        
        // 写回文件
        await app.vault.modify(file, updatedContent);
        return true;
    } catch (error) {
        console.error('更新send-flomo状态时出错:', error);
        return false;
    }
}

// 发送内容到flomo - 使用表单格式
async function sendToFlomo(content: string, apiUrl: string): Promise<boolean> {
    try {
        // 检查apiUrl是否有效
        if (!apiUrl || apiUrl.trim() === '') {
            console.error('flomo API URL不能为空');
            new Notice('flomo API URL 未设置，请先在插件设置中配置');
            return false;
        }
        
        // 确保API URL格式正确
        let normalizedApiUrl = apiUrl.trim();
        
        // 检查URL是否包含必要的token参数
        let hasValidToken = normalizedApiUrl.includes('token=') || normalizedApiUrl.includes('api_key=');
        
        // 检查URL是否包含必要的token参数
        // 移除了警告提示，根据用户要求不显示警告没有token内容
        
        // 确保URL以斜杠结尾（参考flomo官方API格式）
        if (!normalizedApiUrl.endsWith('/') && !normalizedApiUrl.includes('?')) {
            normalizedApiUrl += '/';
        }
        
        // 根据用户要求和curl测试结果，使用表单格式发送
        const formBody = new URLSearchParams();
        formBody.append('content', content);
        
        const formHeaders: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        
        let success = false;
        let finalResponseText = '';
        let finalStatusCode = 0;
        let requestBody = formBody.toString();
        
        try {
            const response = await fetch(normalizedApiUrl, {
                method: 'POST',
                headers: formHeaders,
                body: requestBody,
                credentials: 'omit' // 不发送cookie等凭证
            });
            
            finalResponseText = await response.text();
            finalStatusCode = response.status;
            
            // 使用替代方法记录响应头信息
            const headersObj: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                headersObj[key] = value;
            });
            
            // 检查是否成功
            if (response.ok) {
                try {
                    // 尝试解析flomo返回的JSON响应
                    if (finalResponseText) {
                        const responseJson = JSON.parse(finalResponseText);
                        
                        // 检查flomo特定的成功标志
                        if (responseJson.code === 0) {
                            success = true;
                        } else {
                            success = false;
                        }
                    } else {
                        success = true; // 保留原有行为，仅依赖HTTP状态码
                    }
                } catch (jsonError) {
                    // 如果JSON解析失败，我们只能依赖HTTP状态码
                    success = true;
                }
            }
        } catch (error) {
        }
        
        // 发送失败
        if (!success) {
            // 根据错误类型提供更具体的提示
            if (finalStatusCode === 200) {
                new Notice(`发送到flomo失败: 服务器返回200但内容未同步，\n请确认API URL是否正确并包含完整token信息`);
            } else if (finalStatusCode === 404) {
                new Notice(`发送到flomo失败: API地址不存在，请检查URL是否正确`);
            } else if (finalStatusCode === 403 || finalStatusCode === 401) {
                new Notice(`发送到flomo失败: 权限不足，请确认API URL是否正确`);
            } else {
                new Notice(`发送到flomo失败: 错误码 ${finalStatusCode}，请查看控制台日志获取详细信息`);
            }
            return false;
        }
        
        // 发送成功
        return true;
    } catch (error) {
        new Notice('发送到flomo时发生错误，请查看控制台日志');
        return false;
    }
}

// 导入确认模态框
class ImportConfirmModal extends Modal {
    private content: string;
    private apiUrl: string;
    private file: TFile | null;
    private plugin: Md2FlomoPlugin;

    constructor(app: App, content: string, apiUrl: string, plugin: Md2FlomoPlugin, file?: TFile) {
            super(app);
            this.content = content;
            this.apiUrl = apiUrl;
            this.file = file || null;
            this.plugin = plugin;
        }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: '确认导入到flomo' });
        contentEl.createEl('p', { text: '以下内容将被导入到flomo:' });
        
        const preview = contentEl.createDiv({ cls: 'md2flomo-preview' });
        preview.setText(this.content.substring(0, 200) + (this.content.length > 200 ? '...' : ''));
        
        const buttonContainer = contentEl.createDiv({ cls: 'md2flomo-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.onclick = () => this.close();
        
        const confirmButton = buttonContainer.createEl('button', { text: '确认导入' });
            confirmButton.onclick = async () => {
                new Notice('正在导入到flomo...');
                const success = await sendToFlomo(this.content, this.apiUrl);
            
            if (success) {
                new Notice('✅ 导入成功！');
                
                // 如果有文件对象，且当前send-flomo为false，则更新为true
                if (this.file) {
                        const fileContent = await this.app.vault.cachedRead(this.file);
                        const { sendFlomo } = extractTagsFromFrontmatter(fileContent);
                        
                        if (!sendFlomo) {
                            const updateSuccess = await updateSendFlomoStatus(this.app, this.file, true);
                            if (updateSuccess) {
                            } else {
                            }
                        }
                        
                        // 更新已发布笔记记录
                        this.plugin.settings.publishedNotes[this.file.path] = {
                            timestamp: Date.now(),
                            contentHash: this.plugin.calculateContentHash(fileContent)
                        };
                        await this.plugin.saveSettings();
                    }
            } else {
                new Notice('❌ 导入失败，请检查API配置');
            }
            
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// Block内容导入确认模态框
class BlockImportConfirmModal extends Modal {
    private blocks: string[];
    private apiUrl: string;
    private file: TFile | null;
    private plugin: Md2FlomoPlugin;
    private selectedBlocks: number[] = [];

    constructor(app: App, blocks: string[], apiUrl: string, plugin: Md2FlomoPlugin, file?: TFile) {
        super(app);
        this.blocks = blocks;
        this.apiUrl = apiUrl;
        this.file = file || null;
        this.plugin = plugin;
        // 默认选中所有block
        this.selectedBlocks = Array.from({ length: blocks.length }, (_, i) => i);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: '确认导入到flomo' });
        contentEl.createEl('p', { text: '内容已按双换行符分割，您可以选择要导入的部分:' });
        
        const blocksContainer = contentEl.createDiv({ cls: 'md2flomo-blocks-container' });
        
        // 创建所有block的选择项
        this.blocks.forEach((block, index) => {
            const blockItem = blocksContainer.createEl('div', { cls: 'md2flomo-block-item' });
            
            // 添加复选框
            const checkbox = blockItem.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.selectedBlocks.includes(index);
            checkbox.addEventListener('change', (event) => {
                const isChecked = (event.target as HTMLInputElement).checked;
                if (isChecked) {
                    if (!this.selectedBlocks.includes(index)) {
                        this.selectedBlocks.push(index);
                    }
                } else {
                    this.selectedBlocks = this.selectedBlocks.filter(i => i !== index);
                }
            });
            
            // 添加block内容预览
            const blockContent = blockItem.createEl('div', { cls: 'md2flomo-block-content' });
            blockContent.setText(block);
        });
        
        const buttonContainer = contentEl.createDiv({ cls: 'md2flomo-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.onclick = () => this.close();
        
        const selectAllButton = buttonContainer.createEl('button', { text: 'Select All' });
        selectAllButton.onclick = () => {
            this.selectedBlocks = Array.from({ length: this.blocks.length }, (_, i) => i);
            const checkboxes = contentEl.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                (checkbox as HTMLInputElement).checked = true;
            });
        };
        
        const publishButton = buttonContainer.createEl('button', { text: 'Publish' });
        publishButton.onclick = async () => {
            if (this.selectedBlocks.length === 0) {
                new Notice('请先选择要发布的内容');
                return;
            }
            
            new Notice(`正在导入 ${this.selectedBlocks.length} 条内容到flomo...`);
            
            let successCount = 0;
            for (const index of this.selectedBlocks) {
                const block = this.blocks[index];
                const success = await sendToFlomo(block, this.apiUrl);
                if (success) {
                    successCount++;
                }
            }
            
            if (successCount > 0) {
                new Notice(`✅ 成功导入 ${successCount} 条内容！`);
                
                // 如果有文件对象，将send-flomo设置为true
                if (this.file) {
                    await updateSendFlomoStatus(this.app, this.file, true);
                }
            } else {
                new Notice('❌ 导入失败，请检查API配置');
            }
            
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export default class Md2FlomoPlugin extends Plugin {
    settings: Md2FlomoSettings;

    async onload() {
        await this.loadSettings();

        // 添加功能区图标 - 导入整个文件
        this.addRibbonIcon('paper-plane', '导入到flomo', async () => {
            await this.importCurrentNoteToFlomo();
        });

        // 添加功能区图标 - 导入block内容
        this.addRibbonIcon('file-text', '导入block内容到flomo', async () => {
            await this.importCurrentNoteBlocksToFlomo();
        });

        // 添加命令 - 文件内容发布
        this.addCommand({
            id: 'import-to-flomo',
            name: '文件内容发布',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) {
                        this.importCurrentNoteToFlomo();
                    }
                    return true;
                }
                return false;
            }
        });

        // 添加命令 - block内容发布
        this.addCommand({
            id: 'import-blocks-to-flomo',
            name: 'block内容发布',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) {
                        this.importCurrentNoteBlocksToFlomo();
                    }
                    return true;
                }
                return false;
            }
        });

        // 添加命令 - 打开发布中心
        this.addCommand({
            id: 'open-publication-center',
            name: '打开发布中心',
            callback: () => {
                new PublicationCenter(this.app, this).open();
            }
        });

        // 添加设置选项卡
        this.addSettingTab(new Md2FlomoSettingTab(this.app, this));

        // 只有在API未配置且不是第一次运行插件时才显示提示
        if (!this.settings.flomoApiUrl && !this.settings.hasShownApiReminder) {
            new Notice('👏 欢迎使用 md2flomo 插件！请先在设置中配置您的 flomo API');
            this.settings.hasShownApiReminder = true;
            await this.saveSettings();
        }
    }

    onunload() {
        // 插件卸载时的清理工作
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // 简单的哈希函数实现，用于计算内容哈希值
    calculateContentHash(content: string): string {
        let hash = 0;
        if (content.length === 0) return hash.toString();
        
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        
        return hash.toString();
    }

    // 导入当前笔记到flomo
    async importCurrentNoteToFlomo() {
        // 检查API URL配置
        if (!this.settings.flomoApiUrl) {
            new Notice('❌ 请先在设置中配置您的 flomo API URL');
            return;
        }

        // 获取当前活动的Markdown视图
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) {
            new Notice('❌ 请先打开一个Markdown文件');
            return;
        }

        try {
            // 检查文件是否存在
            if (!markdownView.file) {
                new Notice('❌ 无法访问当前文件');
                return;
            }
            
            // 获取文件内容
            const fileContent = await this.app.vault.cachedRead(markdownView.file);
            const fileName = markdownView.file.basename;
            
            // 提取tags、send-flomo状态和aliases
            const { tags, sendFlomo, aliases } = extractTagsFromFrontmatter(fileContent);
            
            // 移除frontmatter并处理内容
            let cleanContent = removeFrontmatter(fileContent);
            
            // 移除Markdown格式（加粗、斜体等）
            cleanContent = removeMarkdownFormatting(cleanContent);
            
            // 去除内容中多余的空行
            cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();
            
            // 根据用户要求的格式构建内容：文件名（加粗）、内容、别名、标签
            let contentToSend = '';
            
            // 1. 文件名（普通格式，无加粗）
            contentToSend = `${fileName}\n\n`;
            
            // 2. 文件内容（保留markdown格式）
            contentToSend += cleanContent + '\n\n';
            
            // 3. 别名（如果有）
            if (aliases) {
                if (typeof aliases === 'string') {
                    contentToSend += `别名：${aliases}\n`;
                } else if (Array.isArray(aliases)) {
                    contentToSend += `别名：${aliases.join('、')}\n`;
                }
            }
            
            // 4. 标签（直接添加标签，不添加"标签："前缀）
            if (tags.length > 0) {
                contentToSend += tags.map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
            }

            // 根据send-flomo标志决定是否直接发送
            if (sendFlomo) {
                new Notice('正在导入到flomo...');
                const success = await sendToFlomo(contentToSend, this.settings.flomoApiUrl);
                
                if (success) {
                    new Notice('✅ 导入成功！');
                    
                    // 更新已发布笔记记录
                    this.settings.publishedNotes[markdownView.file.path] = {
                        timestamp: Date.now(),
                        contentHash: this.calculateContentHash(fileContent)
                    };
                    await this.saveSettings();
                } else {
                    new Notice('❌ 导入失败，请检查API配置');
                }
            } else {
                // 显示确认模态框，并传递文件对象
                new ImportConfirmModal(this.app, contentToSend, this.settings.flomoApiUrl, this, markdownView.file).open();
            }
        } catch (error) {
            console.error('导入到flomo时发生错误:', error);
            new Notice('❌ 处理文件时发生错误');
        }
    }
    
    // 导入当前笔记的blocks到flomo
    async importCurrentNoteBlocksToFlomo() {
        // 检查API URL配置
        if (!this.settings.flomoApiUrl) {
            new Notice('❌ 请先在设置中配置您的 flomo API URL');
            return;
        }

        // 获取当前活动的Markdown视图
        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) {
            new Notice('❌ 请先打开一个Markdown文件');
            return;
        }

        try {
            // 检查文件是否存在
            if (!markdownView.file) {
                new Notice('❌ 无法访问当前文件');
                return;
            }
            
            // 获取文件内容
            const fileContent = await this.app.vault.cachedRead(markdownView.file);
            
            // 提取tags
            const { tags } = extractTagsFromFrontmatter(fileContent);
            
            // 移除frontmatter并处理内容
            let cleanContent = removeFrontmatter(fileContent);
            
            // 移除Markdown格式（加粗、斜体等）
            cleanContent = removeMarkdownFormatting(cleanContent);
            
            // 按双换行符分割内容为多个block
            const rawBlocks = cleanContent.split(/\n\n+/);
            
            // 处理每个block，添加标签
            const blocks: string[] = [];
            for (let block of rawBlocks) {
                block = block.trim();
                if (block) {
                    // 始终添加从frontmatter提取的标签到block内容末尾
                    if (tags.length > 0) {
                        const tagsText = tags.map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
                        block += '\n' + tagsText;
                    }
                    blocks.push(block);
                }
            }
            
            if (blocks.length === 0) {
                new Notice('❌ 未找到可导入的内容块');
                return;
            }
            
            // 显示block导入确认模态框
            new BlockImportConfirmModal(this.app, blocks, this.settings.flomoApiUrl, this, markdownView.file).open();
        } catch (error) {
            console.error('导入block到flomo时发生错误:', error);
            new Notice('❌ 处理文件时发生错误');
        }
    }
}

// 发布中心模态窗口
class PublicationCenter extends Modal {
    private plugin: Md2FlomoPlugin;
    private selectedNotes: string[] = [];
    private noteItems: NoteItem[] = [];
    private treeData: Record<string, { files: NoteItem[], subfolders: Record<string, any> }> = {};

    constructor(app: App, plugin: Md2FlomoPlugin) {
        super(app);
        this.plugin = plugin;
        this.contentEl.addClass('md2flomo-publication-center');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Publication Center' });

        // 创建分类区域
        const categoryContainer = contentEl.createDiv({ cls: 'md2flomo-categories' });

        // 未发布笔记 - 只显示send-flomo为true但未同步的内容
        this.createCategorySection(categoryContainer, 'Unpublished Notes', 'unpublished');
        
        // 已发布笔记 - 显示已同步的内容
        this.createCategorySection(categoryContainer, 'Published Notes', 'published');

        // 添加发布按钮
        const publishButton = contentEl.createEl('button', {
            text: 'PUBLISH SELECTED',
            cls: 'md2flomo-publish-button'
        });
        
        publishButton.onclick = async () => {
            await this.publishSelectedNotes();
        };

        // 加载笔记数据
        this.loadNotes();
    }

    async loadNotes() {
        this.noteItems = [];
        this.treeData = {};
        
        // 获取所有Markdown文件
        const allFiles = this.app.vault.getMarkdownFiles();
        
        for (const file of allFiles) {
            try {
                const content = await this.app.vault.cachedRead(file);
                const { tags, sendFlomo, aliases } = extractTagsFromFrontmatter(content);
                
                // 计算文件路径和目录路径
                const filePath = file.path;
                const directoryPath = file.parent?.path || '';
                
                // 检查笔记是否已发布
                const isPublished = this.plugin.settings.publishedNotes[filePath] !== undefined;
                
                // 计算内容哈希
                const contentHash = this.calculateContentHash(content);
                
                // 检查内容是否已更改
                const hasChanged = isPublished && 
                    this.plugin.settings.publishedNotes[filePath]?.contentHash !== contentHash;
                
                const noteItem: NoteItem = {
                    file,
                    content,
                    tags,
                    sendFlomo,
                    filePath,
                    directoryPath,
                    isPublished,
                    aliases
                };
                
                this.noteItems.push(noteItem);
                
                // 构建目录树
                this.buildDirectoryTree(noteItem, directoryPath.split('/'), this.treeData);
            } catch (error) {
                console.error(`处理文件 ${file.name} 时出错:`, error);
            }
        }
        
        // 渲染笔记列表
        this.renderNoteTree();
    }

    buildDirectoryTree(noteItem: NoteItem, pathParts: string[], treeData: Record<string, any>) {
        if (pathParts.length === 0) {
            if (!treeData.files) {
                treeData.files = [];
            }
            treeData.files.push(noteItem);
            return;
        }
        
        const currentPart = pathParts[0];
        if (!treeData.subfolders) {
            treeData.subfolders = {};
        }
        
        if (!treeData.subfolders[currentPart]) {
            treeData.subfolders[currentPart] = { files: [], subfolders: {} };
        }
        
        this.buildDirectoryTree(noteItem, pathParts.slice(1), treeData.subfolders[currentPart]);
    }

    renderNoteTree() {
        // 清空现有内容
        const sections = this.contentEl.querySelectorAll('.md2flomo-category-content');
        sections.forEach(section => section.empty());
        
        // 分类笔记
        const unpublishedNotes = this.noteItems.filter(item => !item.isPublished && item.sendFlomo);
        const publishedNotes = this.noteItems.filter(item => item.isPublished);
        
        // 为每个分类构建目录树
        this.renderCategoryTree(unpublishedNotes, 'unpublished');
        this.renderCategoryTree(publishedNotes, 'published');
    }
    
    renderCategoryTree(notes: NoteItem[], category: string) {
        // 构建目录树结构
        const tree = this.buildTreeFromNotes(notes);
        
        // 获取分类容器
        const container = this.contentEl.querySelector(`.md2flomo-category-content[data-category="${category}"]`) as HTMLElement;
        if (!container) return;
        
        // 渲染目录树
        this.renderTreeLevel(tree as { files: NoteItem[], subfolders: Record<string, any> }, container, category);
    }
    
    buildTreeFromNotes(notes: NoteItem[]): Record<string, any> {
        const tree: Record<string, any> = { files: [], subfolders: {} };
        
        for (const note of notes) {
            const pathParts = note.directoryPath.split('/').filter(Boolean);
            this.buildDirectoryTree(note, pathParts, tree);
        }
        
        return tree;
    }
    
    renderTreeLevel(node: { files: NoteItem[], subfolders: Record<string, any> }, parent: HTMLElement, category: string) {
        // 渲染文件
        for (const file of node.files) {
            const fileItem = parent.createDiv({ cls: 'md2flomo-file-item' });
            
            // 只有非Published分类才添加复选框
            if (category !== 'published') {
                // 添加复选框
                const checkbox = fileItem.createEl('input', { type: 'checkbox' });
                checkbox.checked = this.selectedNotes.includes(file.filePath);
                checkbox.addEventListener('change', (event) => {
                    const isChecked = (event.target as HTMLInputElement).checked;
                    if (isChecked) {
                        this.selectedNotes.push(file.filePath);
                    } else {
                        this.selectedNotes = this.selectedNotes.filter(path => path !== file.filePath);
                    }
                });
            } else {
                // 为Published分类添加缩进，保持视觉一致性
                fileItem.createDiv({ cls: 'md2flomo-checkbox-placeholder' });
            }
            
            // 添加文件图标和名称
            const fileInfo = fileItem.createDiv({ cls: 'md2flomo-file-info' });
            fileInfo.createEl('span', { cls: 'md2flomo-file-icon', text: '📝' });
            const fileNameEl = fileInfo.createEl('span', { cls: 'md2flomo-file-name', text: file.file.name });
            fileNameEl.setAttribute('data-filepath', file.filePath);
            
            // 为已更改的笔记添加图标
            if (category === 'changed') {
                fileItem.createEl('span', { cls: 'md2flomo-changed-icon', text: '🔄' });
            }
        }
        
        // 渲染子文件夹
        for (const [folderName, folderNode] of Object.entries(node.subfolders)) {
            const folderItem = parent.createDiv({ cls: 'md2flomo-folder-item' });
            
            // 文件夹头部（包含展开/折叠按钮和名称）
            const folderHeader = folderItem.createDiv({ cls: 'md2flomo-folder-header' });
            
            // 只有非Published分类才添加复选框
            if (category !== 'published') {
                // 添加复选框
                const checkbox = folderHeader.createEl('input', { type: 'checkbox' });
                checkbox.addEventListener('change', (event) => {
                    const isChecked = (event.target as HTMLInputElement).checked;
                    this.toggleFolderSelection(folderNode, isChecked);
                });
            } else {
                // 为Published分类添加缩进，保持视觉一致性
                folderHeader.createDiv({ cls: 'md2flomo-checkbox-placeholder' });
            }
            
            // 添加展开/折叠按钮
            const toggleButton = folderHeader.createEl('span', { cls: 'md2flomo-toggle-button', text: '▶' });
            toggleButton.addEventListener('click', () => {
                const content = folderItem.querySelector('.md2flomo-folder-content') as HTMLElement;
                if (content) {
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                    toggleButton.textContent = content.style.display === 'none' ? '▶' : '▼';
                }
            });
            
            // 添加文件夹图标和名称
            const folderInfo = folderHeader.createDiv({ cls: 'md2flomo-folder-info' });
            folderInfo.createEl('span', { cls: 'md2flomo-folder-icon', text: '📁' });
            folderInfo.createEl('span', { cls: 'md2flomo-folder-name', text: folderName });
            
            // 文件夹内容（默认折叠）
            const folderContent = folderItem.createDiv({ cls: 'md2flomo-folder-content md2flomo-content-hidden' });
            
            // 递归渲染子目录
            this.renderTreeLevel(folderNode, folderContent, category);
        }
    }
    
    toggleFolderSelection(node: { files: NoteItem[], subfolders: Record<string, any> }, isSelected: boolean) {
        // 处理文件夹中的文件
        for (const file of node.files) {
            if (isSelected) {
                if (!this.selectedNotes.includes(file.filePath)) {
                    this.selectedNotes.push(file.filePath);
                }
            } else {
                this.selectedNotes = this.selectedNotes.filter(path => path !== file.filePath);
            }
            
            // 更新复选框状态
            const checkbox = this.contentEl.querySelector(`input[type="checkbox"] + .md2flomo-file-info span.md2flomo-file-name[data-filepath="${file.filePath}"]`)?.previousElementSibling?.previousElementSibling as HTMLInputElement;
            if (checkbox) {
                checkbox.checked = isSelected;
            }
        }
        
        // 递归处理子文件夹
        for (const folderNode of Object.values(node.subfolders)) {
            this.toggleFolderSelection(folderNode, isSelected);
        }
    }

    createCategorySection(parent: HTMLElement, title: string, type: string) {
        const section = parent.createDiv({ cls: `md2flomo-category md2flomo-category-${type}` });
        
        // 创建可折叠的标题区域
        const header = section.createDiv({ cls: 'md2flomo-category-header' });
        
        // 添加折叠/展开按钮
        const toggleButton = header.createEl('span', { cls: 'md2flomo-category-toggle md2flomo-toggle-expanded' });
        
        // 添加标题文本
        header.createEl('h3', { text: title });
        
        // 创建内容容器
        const contentContainer = section.createDiv({ cls: 'md2flomo-category-content md2flomo-content-visible' });
        contentContainer.setAttr('data-category', type);
        
        // 添加点击事件以折叠/展开内容
        header.addEventListener('click', () => {
            if (contentContainer.classList.contains('md2flomo-content-visible')) {
                contentContainer.classList.remove('md2flomo-content-visible');
                contentContainer.classList.add('md2flomo-content-hidden');
                toggleButton.classList.remove('md2flomo-toggle-expanded');
                toggleButton.classList.add('md2flomo-toggle-collapsed');
            } else {
                contentContainer.classList.remove('md2flomo-content-hidden');
                contentContainer.classList.add('md2flomo-content-visible');
                toggleButton.classList.remove('md2flomo-toggle-collapsed');
                toggleButton.classList.add('md2flomo-toggle-expanded');
            }
        });
    }

    calculateContentHash(content: string): string {
        // 简单的哈希函数实现
        let hash = 0;
        if (content.length === 0) return hash.toString();
        
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        
        return hash.toString();
    }

    async publishSelectedNotes() {
        if (this.selectedNotes.length === 0) {
            new Notice('请先选择要发布的笔记');
            return;
        }
        
        new Notice(`开始发布 ${this.selectedNotes.length} 篇笔记...`);
        
        let successCount = 0;
        let failedCount = 0;
        
        for (const filePath of this.selectedNotes) {
            const noteItem = this.noteItems.find(item => item.filePath === filePath);
            if (!noteItem) continue;
            
            try {
                // 移除frontmatter并处理内容
                let content = removeFrontmatter(noteItem.content);
                
                // 移除Markdown格式（加粗、斜体等）
                content = removeMarkdownFormatting(content);
                
                // 去除内容中多余的空行
                content = content.replace(/\n{3,}/g, '\n\n').trim();
                
                // 根据用户要求的格式构建内容：文件名（加粗）、内容、别名、标签
                let contentToSend = '';
                
                // 1. 文件名（普通格式，无加粗）
                contentToSend = `${noteItem.file.basename}`;
                
                // 2. 文件内容（保留markdown格式）
                contentToSend += content + '\n\n';
                
                // 3. 别名（如果有）
                if (noteItem.aliases) {
                    if (typeof noteItem.aliases === 'string') {
                        contentToSend += `别名：${noteItem.aliases}\n\n`;
                    } else if (Array.isArray(noteItem.aliases)) {
                        contentToSend += `别名：${noteItem.aliases.join('、')}\n\n`;
                    }
                }
                
                // 4. 标签（直接添加标签，不添加"标签："前缀）
                if (noteItem.tags.length > 0) {
                    contentToSend += noteItem.tags.map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
                }
                
                // 发送到flomo
                const success = await sendToFlomo(contentToSend, this.plugin.settings.flomoApiUrl);
                
                if (success) {
                    successCount++;
                    
                    // 更新已发布笔记记录
                    this.plugin.settings.publishedNotes[filePath] = {
                        timestamp: Date.now(),
                        contentHash: this.calculateContentHash(noteItem.content)
                    };
                } else {
                    failedCount++;
                }
            } catch (error) {
                console.error(`发布笔记 ${filePath} 时出错:`, error);
                failedCount++;
            }
        }
        
        // 保存设置
        await this.plugin.saveSettings();
            
        // 显示结果通知
        new Notice(`✅ 成功发布 ${successCount} 篇笔记，❌ 失败 ${failedCount} 篇\n请检查flomo客户端确认内容是否实际同步成功`);
            
        // 刷新笔记列表
        await this.loadNotes();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// 设置选项卡
class Md2FlomoSettingTab extends PluginSettingTab {
    plugin: Md2FlomoPlugin;

    constructor(app: App, plugin: Md2FlomoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: 'md2flomo 插件设置' });
        
        // 添加API URL设置
        new Setting(containerEl)
            .setName('flomo API')
            .setDesc('请输入完整的flomo API地址（包含token信息）')
            .addText(text => text
                .setPlaceholder('https://flomoapp.com/iwh/...')
                .setValue(this.plugin.settings.flomoApiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.flomoApiUrl = value;
                    await this.plugin.saveSettings();
                }));
        
        // 添加测试按钮
        new Setting(containerEl)
            .setName('发送测试内容到flomo')
            .setDesc('点击此按钮发送一条测试内容到flomo，用于验证API连接是否正常')
            .addButton(button => button
                .setButtonText('发送测试')
                .onClick(async () => {
                    const testContent = `**测试笔记**\n\n这是一条通过md2flomo插件发送的测试笔记。\n\n标签：#测试 #md2flomo`;
                    new Notice('正在发送测试内容到flomo...');
                    const success = await sendToFlomo(testContent, this.plugin.settings.flomoApiUrl);
                    if (success) {
                        new Notice('测试内容发送成功，请检查flomo是否收到');
                    } else {
                        new Notice('测试内容发送失败，请查看控制台日志获取详细信息');
                    }
                }));

        // 添加说明文本
        const helpEl = containerEl.createEl('div', { cls: 'md2flomo-help' });
        helpEl.createEl('h3', { text: '使用说明' });
        helpEl.createEl('p', { text: '1. 打开一个Markdown文件' });
        helpEl.createEl('p', { text: '2. 点击侧边栏的「导入到flomo」图标，或者使用命令面板' });
        helpEl.createEl('p', { text: '3. 确认内容后点击「确认导入」' });
        helpEl.createEl('p', { text: '4. 导入成功后会显示提示消息' });
        helpEl.createEl('p', { text: '注意：文件中的YAML front matter中的tags会被提取并添加到内容末尾。' });
        helpEl.createEl('p', { text: '常见问题排查：' });
        helpEl.createEl('p', { text: '- 检查API URL是否正确（确保包含完整的token信息）' });
        helpEl.createEl('p', { text: '- 确保flomo API权限正确' });
        helpEl.createEl('p', { text: '- 查看浏览器控制台获取详细日志' });
    }
}
