'use client';

import { useEffect } from 'react';

/**
 * 微信浏览器字体适配组件
 * 强制禁止微信内置浏览器的字体缩放，防止页面布局错乱
 * 这个问题在 Android 微信上特别常见
 */
export function WeChatFontHandler() {
    useEffect(() => {
        // 核心处理函数
        const handleFontSize = () => {
            // 设置字体为默认大小
            (window as any).WeixinJSBridge?.invoke('setFontSizeCallback', { 'fontSize': 0 });

            // 重写设置字体大小的事件
            (window as any).WeixinJSBridge?.on('menu:setfont', function () {
                (window as any).WeixinJSBridge?.invoke('setFontSizeCallback', { 'fontSize': 0 });
            });
        };

        // 尝试直接执行
        if (
            typeof (window as any).WeixinJSBridge === 'object' &&
            typeof (window as any).WeixinJSBridge.invoke === 'function'
        ) {
            handleFontSize();
        } else {
            // 监听 BridgeReady 事件
            if (document.addEventListener) {
                document.addEventListener('WeixinJSBridgeReady', handleFontSize, false);
            } else if ((document as any).attachEvent) {
                (document as any).attachEvent('WeixinJSBridgeReady', handleFontSize);
                (document as any).attachEvent('onWeixinJSBridgeReady', handleFontSize);
            }
        }
    }, []);

    return null;
}
