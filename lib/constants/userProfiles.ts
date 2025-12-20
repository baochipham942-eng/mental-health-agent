export interface UserProfile {
    id: string;
    trait: string;
    nickname: string;
    avatar: string;
}

export const USER_PROFILES: UserProfile[] = [
    {
        id: 'confident',
        trait: '自信',
        nickname: '晨曦领航者',
        avatar: '/avatars/confident.png',
    },
    {
        id: 'smart',
        trait: '聪明',
        nickname: '星纬逻辑师',
        avatar: '/avatars/smart.png',
    },
    {
        id: 'kind',
        trait: '善良',
        nickname: '温润守护灵',
        avatar: '/avatars/kind.png',
    },
    {
        id: 'honest',
        trait: '诚实',
        nickname: '净澈回声',
        avatar: '/avatars/honest.png',
    },
    {
        id: 'loyal',
        trait: '忠诚',
        nickname: '长青之锚',
        avatar: '/avatars/loyal-v2.svg', // 使用高精度的 SVG 锚点图标提升清晰度
    },
    {
        id: 'humorous',
        trait: '幽默',
        nickname: '妙语弄潮儿',
        avatar: '/avatars/humorous.png',
    },
    {
        id: 'creative',
        trait: '创意',
        nickname: '幻彩织梦人',
        avatar: '/avatars/creative.png',
    },
];

export function getRandomProfile(): UserProfile {
    const randomIndex = Math.floor(Math.random() * USER_PROFILES.length);
    return USER_PROFILES[randomIndex];
}

export function getProfileById(id: string): UserProfile | undefined {
    return USER_PROFILES.find((p) => p.id === id);
}
