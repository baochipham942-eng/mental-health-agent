'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getAmbientSound, type SoundType } from '@/lib/utils/ambient-sound-v2';

const STORAGE_KEY = 'ambient-sound-pref';

function loadPref(): { soundType: SoundType; volume: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { soundType: 'rain', volume: 0.5 };
}

function savePref(soundType: SoundType, volume: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ soundType, volume }));
  } catch { /* ignore */ }
}

/**
 * 环境音 React Hook
 * 封装 AmbientSoundV2 singleton，管理播放状态和用户偏好
 */
export function useAmbientSound() {
  const pref = useRef(loadPref());
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundType, setSoundTypeState] = useState<SoundType>(pref.current.soundType);
  const [volume, setVolumeState] = useState(pref.current.volume);

  // 同步 singleton 状态到 React state（处理多组件共用场景）
  useEffect(() => {
    const engine = getAmbientSound();
    setIsPlaying(engine.isPlaying);
  }, []);

  const play = useCallback((type?: SoundType) => {
    const engine = getAmbientSound();
    const targetType = type || soundType;
    engine.setVolume(volume);
    engine.start(targetType);
    setIsPlaying(true);
    if (type) setSoundTypeState(type);
  }, [soundType, volume]);

  const stop = useCallback(() => {
    getAmbientSound().stop();
    setIsPlaying(false);
  }, []);

  const fadeOutAndStop = useCallback(() => {
    getAmbientSound().fadeOutAndStop();
    // 延迟更新状态，等淡出完成
    setTimeout(() => setIsPlaying(false), 2300);
  }, []);

  const setSoundType = useCallback((type: SoundType) => {
    setSoundTypeState(type);
    savePref(type, volume);
    const engine = getAmbientSound();
    if (engine.isPlaying) {
      engine.switchSound(type);
    }
  }, [volume]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    savePref(soundType, v);
    getAmbientSound().setVolume(v);
  }, [soundType]);

  // 组件卸载时不停止音频（singleton 跨组件共享），但清理引用
  // 真正的 stop 由 Widget 的 handleStop 显式触发

  return {
    isPlaying,
    soundType,
    volume,
    play,
    stop,
    fadeOutAndStop,
    setSoundType,
    setVolume,
  };
}
