export type ResourceType = 'crisis_hotline' | 'psycho_education' | 'coping_strategy';

export interface BaseResource {
    id: string;
    type: ResourceType;
    title: string;
    description: string;
}

export interface CrisisHotlineResource extends BaseResource {
    type: 'crisis_hotline';
    phone: string;
    hours: string;
}

export interface PsychoEducationResource extends BaseResource {
    type: 'psycho_education';
    content: string;
    readingTime: number; // minutes
}

export interface CopingStrategyResource extends BaseResource {
    type: 'coping_strategy';
    difficulty: 'easy' | 'medium' | 'hard';
    duration: string;
    steps: string[];
    widget?: string; // We saw usage of widget in ActionCard, maybe relevant here too?
}

export type AnyResource = CrisisHotlineResource | PsychoEducationResource | CopingStrategyResource;
