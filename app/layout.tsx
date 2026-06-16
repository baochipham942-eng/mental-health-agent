import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#f8fafc',
};
import './globals.css';
// Arco Design 样式
import '@arco-design/web-react/dist/css/arco.css';
import { ArcoConfigProvider } from '@/components/providers/ArcoConfigProvider';

import { WeChatFontHandler } from '@/components/layout/WeChatFontHandler';
import { PostHogPageView } from '@/components/providers/PostHogPageView';

export const metadata: Metadata = {
  title: '心灵树洞 - 你的解压搭子',
  description: '随时陪你聊聊的 AI 伙伴，帮你理清思路、释放压力、找回状态',
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon.ico',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full min-h-dvh bg-gray-50 text-gray-900 antialiased">
        <PostHogPageView />
        <WeChatFontHandler />
        <ArcoConfigProvider>
          {children}
        </ArcoConfigProvider>
        <div id="modal-root" />
      </body>
    </html>
  );
}



