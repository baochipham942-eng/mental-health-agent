/**
 * 资源加载器
 * 负责从文件系统加载和解析资源数据
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    CrisisHotlineResource,
    PsychoEducationResource,
    CopingStrategyResource,
    HotlinesData,
    StrategiesData,
    ResourceIndex,
    AnyResource,
} from './types';

/**
 * 解析 Markdown frontmatter
 * 支持 YAML 格式的 frontmatter
 */
function parseFrontmatter(content: string): {
    metadata: Record<string, any>;
    content: string;
} {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        return { metadata: {}, content };
    }

    const [, yamlContent, markdownContent] = match;

    // 简单的 YAML 解析（支持基本格式）
    const metadata: Record<string, any> = {};
    let currentKey = '';
    let inArray = false;
    let arrayKey = '';
    let arrayValues: string[] = [];

    yamlContent.split('\n').forEach((line) => {
        // 跳过空行
        if (!line.trim()) return;

        // 检查是否是数组项
        if (line.match(/^\s+-\s+/)) {
            const value = line.replace(/^\s+-\s+/, '').trim();
            if (inArray) {
                arrayValues.push(value);
            }
            return;
        }

        // 如果之前在处理数组，先保存
        if (inArray && arrayValues.length > 0) {
            if (currentKey && arrayKey) {
                if (!metadata[currentKey]) metadata[currentKey] = {};
                metadata[currentKey][arrayKey] = arrayValues;
            } else if (arrayKey) {
                metadata[arrayKey] = arrayValues;
            }
            arrayValues = [];
            inArray = false;
        }

        // 解析键值对
        const kvMatch = line.match(/^(\s*)(\w+):\s*(.*)$/);
        if (kvMatch) {
            const [, indent, key, value] = kvMatch;
            const indentLevel = indent.length;

            if (indentLevel === 0) {
                // 顶级键
                currentKey = '';
                if (value) {
                    metadata[key] = parseValue(value);
                } else {
                    // 可能是对象或数组的开始
                    currentKey = key;
                    metadata[key] = {};
                }
            } else if (indentLevel > 0 && currentKey) {
                // 嵌套键
                if (value) {
                    metadata[currentKey][key] = parseValue(value);
                } else {
                    // 数组开始
                    inArray = true;
                    arrayKey = key;
                    arrayValues = [];
                }
            }
        }
    });

    // 处理最后一个数组
    if (inArray && arrayValues.length > 0) {
        if (currentKey && arrayKey) {
            if (!metadata[currentKey]) metadata[currentKey] = {};
            metadata[currentKey][arrayKey] = arrayValues;
        } else if (arrayKey) {
            metadata[arrayKey] = arrayValues;
        }
    }

    return { metadata, content: markdownContent.trim() };
}

/**
 * 解析值（处理数字、布尔值等）
 */
function parseValue(value: string): string | number | boolean {
    const trimmed = value.trim();

    // 数字
    if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed, 10);
    }
    if (/^\d+\.\d+$/.test(trimmed)) {
        return parseFloat(trimmed);
    }

    // 布尔值
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;

    return trimmed;
}

/**
 * 资源加载器类
 */
export class ResourceLoader {
    private basePath: string;
    private hotlinesCache: CrisisHotlineResource[] | null = null;
    private educationCache: PsychoEducationResource[] | null = null;
    private strategiesCache: CopingStrategyResource[] | null = null;

    constructor(basePath?: string) {
        // 默认路径：项目根目录下的 data/resources
        this.basePath = basePath || path.join(process.cwd(), 'data', 'resources');
    }

    /**
     * 加载危机热线数据
     */
    loadHotlines(): CrisisHotlineResource[] {
        if (this.hotlinesCache) {
            return this.hotlinesCache;
        }

        try {
            const filePath = path.join(this.basePath, 'contacts.json');
            const content = fs.readFileSync(filePath, 'utf-8');
            const data: HotlinesData = JSON.parse(content);
            this.hotlinesCache = data.hotlines;
            return this.hotlinesCache;
        } catch (error) {
            console.error('[RAG Loader] Failed to load hotlines:', error);
            return [];
        }
    }

    /**
     * 加载应对策略资源
     */
    loadStrategies(): CopingStrategyResource[] {
        if (this.strategiesCache) {
            return this.strategiesCache;
        }

        try {
            const filePath = path.join(this.basePath, 'strategies.json');
            const content = fs.readFileSync(filePath, 'utf-8');
            const data: StrategiesData = JSON.parse(content);
            this.strategiesCache = data.strategies;
            return this.strategiesCache;
        } catch (error) {
            console.error('[RAG Loader] Failed to load strategies:', error);
            return [];
        }
    }

    /**
     * 加载心理教育资源
     */
    loadEducationResources(): PsychoEducationResource[] {
        if (this.educationCache) {
            return this.educationCache;
        }

        try {
            const educationPath = path.join(this.basePath, 'education');
            const indexPath = path.join(educationPath, 'index.json');

            // 读取索引文件
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            const index: ResourceIndex = JSON.parse(indexContent);

            const resources: PsychoEducationResource[] = [];

            for (const item of index.resources) {
                try {
                    const filePath = path.join(educationPath, item.file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const { metadata, content: markdownContent } = parseFrontmatter(content);

                    const resource: PsychoEducationResource = {
                        id: metadata.id || item.id,
                        type: 'psycho_education',
                        title: metadata.title || item.title,
                        description: metadata.summary || '',
                        summary: metadata.summary || '',
                        category: metadata.category || item.category,
                        content: markdownContent,
                        readingTime: metadata.readingTime || 5,
                        applicability: metadata.applicability || {},
                        priority: metadata.priority || 5,
                        createdAt: index.lastUpdated,
                        updatedAt: index.lastUpdated,
                    };

                    resources.push(resource);
                } catch (fileError) {
                    console.error(`[RAG Loader] Failed to load education file ${item.file}:`, fileError);
                }
            }

            this.educationCache = resources;
            return resources;
        } catch (error) {
            console.error('[RAG Loader] Failed to load education resources:', error);
            return [];
        }
    }

    /**
     * 获取所有资源
     */
    getAllResources(): AnyResource[] {
        const hotlines = this.loadHotlines();
        const education = this.loadEducationResources();
        const strategies = this.loadStrategies();
        return [...hotlines, ...education, ...strategies];
    }

    /**
     * 清除缓存（用于热重载）
     */
    clearCache(): void {
        this.hotlinesCache = null;
        this.educationCache = null;
        this.strategiesCache = null;
    }

    /**
     * 根据 ID 获取资源
     */
    getResourceById(id: string): AnyResource | undefined {
        return this.getAllResources().find((r) => r.id === id);
    }
}

// 导出单例实例
let loaderInstance: ResourceLoader | null = null;

export function getResourceLoader(): ResourceLoader {
    if (!loaderInstance) {
        loaderInstance = new ResourceLoader();
    }
    return loaderInstance;
}
