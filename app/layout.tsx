import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

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

import { NextAuthSessionProvider } from '@/components/providers/NextAuthSessionProvider';
import { WeChatFontHandler } from '@/components/layout/WeChatFontHandler';

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
        <NextAuthSessionProvider>
          <WeChatFontHandler />
          <ArcoConfigProvider>
            {children}
          </ArcoConfigProvider>
        </NextAuthSessionProvider>
        <div id="modal-root" />
        <Script id="posthog" strategy="afterInteractive">
          {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init('phc_d2wFkzuteiumc9nN1QtTlILnChyj30PbXuQiWMVeoFq',{api_host:'https://us.i.posthog.com',person_profiles:'identified_only'});`}
        </Script>
      </body>
    </html>
  );
}




