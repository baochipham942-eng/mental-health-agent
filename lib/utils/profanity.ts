/**
 * 违规词检测工具
 * 用于检测用户输入是否包含敏感内容
 */

// 违规词分类
const PROFANITY_CATEGORIES = {
  political: [
    '习近平', '毛泽东', '邓小平', '江泽民', '胡锦涛',
    '共产党', '国民党', '法轮功', '六四', '天安门',
    '台独', '藏独', '疆独', '港独', '民运',
    '反共', '反党', '颠覆', '政变', '暴动'
  ],
  pornographic: [
    '色情', '裸体', '性爱', '做爱', '操逼',
    'porn', 'sex', 'nude', 'xxx', '嫖娼',
    '卖淫', '援交', '约炮', '一夜情'
  ],
  violent: [
    '杀人', '砍人', '灭门', '血腥', '残杀',
    '屠杀', '恐怖袭击', '爆炸', '炸弹', '枪击'
  ],
  insulting: [
    '傻逼', '草泥马', '操你妈', '去死', '垃圾',
    '废物', '白痴', '智障', '脑残', 'sb',
    'fuck', 'shit', 'bitch', 'asshole'
  ],
  illegal: [
    '毒品', '吸毒', '贩毒', '大麻', '海洛因',
    '冰毒', '赌博', '洗钱', '诈骗', '传销'
  ]
} as const;

type ProfanityCategory = keyof typeof PROFANITY_CATEGORIES;

const CATEGORY_NAMES: Record<ProfanityCategory, string> = {
  political: '政治敏感',
  pornographic: '色情低俗',
  violent: '暴力血腥',
  insulting: '侮辱谩骂',
  illegal: '违法违规'
};

// 构建所有违规词的集合（用于快速查找）
const ALL_PROFANITY_WORDS = new Set(
  Object.values(PROFANITY_CATEGORIES).flat()
);

// 构建词与分类的映射
const WORD_TO_CATEGORY = new Map<string, ProfanityCategory>();
for (const [category, words] of Object.entries(PROFANITY_CATEGORIES)) {
  for (const word of words) {
    WORD_TO_CATEGORY.set(word.toLowerCase(), category as ProfanityCategory);
  }
}

/**
 * 检测文本是否包含违规词
 * @param text 待检测的文本
 * @returns 是否包含违规词
 */
export function containsProfanity(text: string): boolean {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  for (const word of ALL_PROFANITY_WORDS) {
    if (lowerText.includes(word.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * 获取违规原因描述
 * @param text 待检测的文本
 * @returns 违规原因，如果没有违规则返回 null
 */
export function getProfanityReason(text: string): string | null {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  const foundCategories = new Set<ProfanityCategory>();
  
  for (const word of ALL_PROFANITY_WORDS) {
    if (lowerText.includes(word.toLowerCase())) {
      const category = WORD_TO_CATEGORY.get(word.toLowerCase());
      if (category) {
        foundCategories.add(category);
      }
    }
  }
  
  if (foundCategories.size === 0) return null;
  
  const categoryNames = Array.from(foundCategories)
    .map(cat => CATEGORY_NAMES[cat])
    .join('、');
  
  return `包含${categoryNames}内容`;
}

/**
 * 检测并返回详细的违规信息
 * @param text 待检测的文本
 * @returns 违规检测结果
 */
export function checkProfanity(text: string): {
  hasProfanity: boolean;
  reason: string | null;
  categories: ProfanityCategory[];
} {
  if (!text) {
    return { hasProfanity: false, reason: null, categories: [] };
  }
  
  const lowerText = text.toLowerCase();
  const foundCategories = new Set<ProfanityCategory>();
  
  for (const word of ALL_PROFANITY_WORDS) {
    if (lowerText.includes(word.toLowerCase())) {
      const category = WORD_TO_CATEGORY.get(word.toLowerCase());
      if (category) {
        foundCategories.add(category);
      }
    }
  }
  
  const categories = Array.from(foundCategories);
  const hasProfanity = categories.length > 0;
  const reason = hasProfanity
    ? `包含${categories.map(cat => CATEGORY_NAMES[cat]).join('、')}内容`
    : null;
  
  return { hasProfanity, reason, categories };
}
