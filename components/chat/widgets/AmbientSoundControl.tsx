'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { SOUND_OPTIONS, type SoundType } from '@/lib/utils/ambient-sound-v2';

interface AmbientSoundControlProps {
  isPlaying: boolean;
  soundType: SoundType;
  volume: number;
  onSoundTypeChange: (type: SoundType) => void;
  onVolumeChange: (volume: number) => void;
  onMute: () => void;
}

/**
 * 环境音控制条 — 嵌入练习 Widget 底部
 * 半透明胶囊：音色切换 + 音量条 + 静音按钮
 */
export function AmbientSoundControl({
  isPlaying,
  soundType,
  volume,
  onSoundTypeChange,
  onVolumeChange,
  onMute,
}: AmbientSoundControlProps) {
  return (
    <AnimatePresence>
      {isPlaying && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/10 backdrop-blur-xs"
        >
          {/* 音色切换按钮 */}
          {SOUND_OPTIONS.map(({ type, icon, label }) => (
            <button
              key={type}
              onClick={() => onSoundTypeChange(type)}
              title={label}
              className={`w-7 h-7 rounded-full text-sm flex items-center justify-center transition-all ${
                soundType === type
                  ? 'bg-white/80 shadow-xs scale-110'
                  : 'hover:bg-white/40'
              }`}
            >
              {icon}
            </button>
          ))}

          {/* 分隔线 */}
          <div className="w-px h-4 bg-white/20 mx-0.5" />

          {/* 音量滑块 */}
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            className="w-14 h-1 accent-white/80 cursor-pointer [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3"
            title={`音量 ${Math.round(volume * 100)}%`}
          />

          {/* 静音/关闭按钮 */}
          <button
            onClick={onMute}
            title="关闭环境音"
            className="w-7 h-7 rounded-full text-xs flex items-center justify-center hover:bg-white/40 text-white/70 transition-all"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
