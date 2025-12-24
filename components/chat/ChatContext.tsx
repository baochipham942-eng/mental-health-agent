'use client';

import { createContext, useContext } from 'react';

interface ChatActionContextType {
    sendMessage: (content: string) => Promise<void>;
    isLoading: boolean;
}

const ChatActionContext = createContext<ChatActionContextType | undefined>(undefined);

export function useChatActions() {
    const context = useContext(ChatActionContext);
    if (!context) {
        throw new Error('useChatActions must be used within a ChatActionProvider');
    }
    return context;
}

export const ChatActionProvider = ChatActionContext.Provider;
