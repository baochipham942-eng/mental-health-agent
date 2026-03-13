'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeavesOnStreamProps {
  onComplete: (duration: number) => void;
  setHeaderControl: (node: React.ReactNode) => void;
  onStart: () => void;
}

interface Balloon {
  id: string;
  text: string;
  x: number;      // 水平位置 %
  color: number;   // 颜色索引
  size: number;    // 大小系数 0.85-1.15
  swayDir: number; // 摆动方向 1 or -1
}

// 气球配色 — 柔和马卡龙色系
const BALLOON_COLORS = [
  { body: 'from-rose-300 to-pink-400',    highlight: 'bg-white/40', string: 'border-pink-300/60' },
  { body: 'from-sky-300 to-blue-400',     highlight: 'bg-white/40', string: 'border-sky-300/60' },
  { body: 'from-violet-300 to-purple-400', highlight: 'bg-white/40', string: 'border-violet-300/60' },
  { body: 'from-amber-200 to-orange-300',  highlight: 'bg-white/50', string: 'border-amber-300/60' },
  { body: 'from-emerald-300 to-teal-400',  highlight: 'bg-white/40', string: 'border-emerald-300/60' },
  { body: 'from-fuchsia-300 to-pink-400',  highlight: 'bg-white/40', string: 'border-fuchsia-300/60' },
];

export function LeavesOnStream({ onComplete, setHeaderControl, onStart }: LeavesOnStreamProps) {
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStarted, setIsStarted] = useState(false);
  const [releasedCount, setReleasedCount] = useState(0);
  const startTimeRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorIdx = useRef(0);

  useEffect(() => {
    if (isStarted) {
      setHeaderControl(
        <button
          onClick={() => onComplete(Math.round((Date.now() - startTimeRef.current) / 1000))}
          className="px-4 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-full text-xs font-medium hover:bg-gray-50 hover:text-violet-600 transition-colors"
        >
          结束练习
        </button>
      );
    } else {
      setHeaderControl(null);
    }
  }, [isStarted, setHeaderControl, onComplete]);

  const handleStart = () => {
    setIsStarted(true);
    startTimeRef.current = Date.now();
    onStart();
    setTimeout(() => inputRef.current?.focus(), 300);
  };

  const addBalloon = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    const balloon: Balloon = {
      id: `${Date.now()}-${Math.random()}`,
      text,
      x: 25 + Math.random() * 50, // 25%-75% 水平范围
      color: colorIdx.current % BALLOON_COLORS.length,
      size: 0.9 + Math.random() * 0.2,
      swayDir: Math.random() > 0.5 ? 1 : -1,
    };
    colorIdx.current++;

    setBalloons(prev => [...prev, balloon]);
    setReleasedCount(prev => prev + 1);
    setInputText('');
    inputRef.current?.focus();
  }, [inputText]);

  const removeBalloon = useCallback((id: string) => {
    setBalloons(prev => prev.filter(b => b.id !== id));
  }, []);

  // ========================
  // 引导页
  // ========================
  if (!isStarted) {
    return (
      <div className="relative flex flex-col items-center justify-center h-[380px] px-6 text-center select-none overflow-hidden">
        {/* 天空背景 */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-100 to-orange-50/30" />
        {/* 装饰云 */}
        <div className="absolute top-8 left-[10%] w-20 h-6 bg-white/60 rounded-full blur-sm" />
        <div className="absolute top-16 right-[15%] w-16 h-5 bg-white/40 rounded-full blur-sm" />
        <div className="absolute top-28 left-[30%] w-12 h-4 bg-white/30 rounded-full blur-sm" />

        <div className="relative z-10 flex flex-col items-center">
          {/* 气球插画 */}
          <div className="relative mb-6 flex items-end gap-2">
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <MiniBallon color={BALLOON_COLORS[0]} size={40} />
            </motion.div>
            <motion.div
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            >
              <MiniBallon color={BALLOON_COLORS[1]} size={52} />
            </motion.div>
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
            >
              <MiniBallon color={BALLOON_COLORS[2]} size={36} />
            </motion.div>
          </div>

          <h3 className="text-lg font-bold text-slate-700 mb-3">放飞念头</h3>
          <p className="text-[13px] text-slate-400 max-w-[240px] leading-[1.8] mb-8">
            把脑海中的念头写在气球上<br />
            轻轻松手，看它飘向远方<br />
            你不需要抓住每一个想法
          </p>

          <button
            onClick={handleStart}
            className="group relative px-7 py-2.5 rounded-full text-[14px] font-semibold transition-all duration-300 bg-gradient-to-r from-sky-400 to-violet-400 text-white shadow-lg shadow-sky-200/50 hover:shadow-xl hover:shadow-sky-200/60 hover:scale-[1.03] active:scale-[0.97]"
          >
            开始练习
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // 练习主界面
  // ========================
  return (
    <div className="relative h-[420px] rounded-2xl overflow-hidden select-none">
      {/* 天空 */}
      <SkyBackground />

      {/* 气球层 */}
      <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
        <AnimatePresence>
          {balloons.map(b => (
            <FlyingBalloon key={b.id} balloon={b} onDone={() => removeBalloon(b.id)} />
          ))}
        </AnimatePresence>
      </div>

      {/* 空状态 */}
      {balloons.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-5 pointer-events-none pb-20">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center"
          >
            <p className="text-white/50 text-sm font-medium">写下念头，放飞它</p>
            <p className="text-white/30 text-xs mt-1.5">让它随风飘走…</p>
          </motion.div>
        </div>
      )}

      {/* 计数 */}
      {releasedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-3 left-3 z-20"
        >
          <div className="bg-white/30 backdrop-blur-md rounded-full px-3 py-1 text-white/90 text-[11px] font-medium border border-white/20">
            🎈 已放飞 {releasedCount} 个念头
          </div>
        </motion.div>
      )}

      {/* 输入区 */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-4 pb-5">
        <div className="relative max-w-sm mx-auto">
          <div className="bg-white/85 backdrop-blur-xl rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-white/90 p-1.5 flex gap-1.5 transition-all focus-within:shadow-[0_4px_30px_rgba(0,0,0,0.12)] focus-within:bg-white/95">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addBalloon();
                }
              }}
              placeholder="写下一个念头…"
              className="flex-1 px-4 py-2.5 rounded-xl bg-transparent text-slate-600 placeholder:text-slate-300 focus:outline-none text-[13px]"
              autoComplete="off"
            />
            <button
              onClick={addBalloon}
              disabled={!inputText.trim()}
              className="px-4 py-2.5 bg-gradient-to-r from-sky-400 to-violet-400 text-white rounded-xl text-[13px] font-semibold shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              放飞
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ========================
// 天空背景
// ========================
function SkyBackground() {
  return (
    <div className="absolute inset-0 z-0">
      {/* 天空渐变 */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-400 via-sky-300 to-sky-200" />

      {/* 云朵 */}
      {[
        { top: '8%',  w: 120, h: 32, opacity: 0.6, dur: 25, startX: '-10%' },
        { top: '18%', w: 80,  h: 24, opacity: 0.4, dur: 30, startX: '20%' },
        { top: '30%', w: 100, h: 28, opacity: 0.5, dur: 22, startX: '-5%' },
        { top: '12%', w: 60,  h: 18, opacity: 0.3, dur: 28, startX: '60%' },
        { top: '42%', w: 70,  h: 20, opacity: 0.25, dur: 35, startX: '40%' },
      ].map((cloud, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            top: cloud.top,
            width: cloud.w,
            height: cloud.h,
            opacity: cloud.opacity,
            filter: 'blur(6px)',
            left: cloud.startX,
          }}
          animate={{ x: ['0%', '120%'] }}
          transition={{
            duration: cloud.dur,
            repeat: Infinity,
            ease: 'linear',
            delay: i * 3,
          }}
        />
      ))}

      {/* 阳光光晕 */}
      <div className="absolute top-[-20%] right-[-10%] w-60 h-60 bg-amber-100/20 rounded-full blur-3xl" />

      {/* 底部地平线柔化 */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-sky-100/40 to-transparent" />
    </div>
  );
}

// ========================
// 引导页小气球
// ========================
function MiniBallon({ color, size }: { color: typeof BALLOON_COLORS[0]; size: number }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`rounded-full bg-gradient-to-br ${color.body} shadow-lg relative`}
        style={{ width: size, height: size * 1.15 }}
      >
        {/* 高光 */}
        <div className={`absolute top-[15%] left-[20%] w-[30%] h-[25%] ${color.highlight} rounded-full blur-[2px]`} />
        {/* 底部尖角 */}
        <div className={`absolute bottom-[-3px] left-1/2 -translate-x-1/2 w-2 h-2 bg-gradient-to-b ${color.body} rotate-45`} />
      </div>
      {/* 线 */}
      <div className={`w-0 h-6 border-l border-dashed ${color.string}`} />
    </div>
  );
}

// ========================
// 飘飞气球
// ========================
function FlyingBalloon({ balloon, onDone }: { balloon: Balloon; onDone: () => void }) {
  const color = BALLOON_COLORS[balloon.color];
  const baseW = balloon.size * 78;
  const baseH = baseW * 1.18;
  const flyDuration = 20 + Math.random() * 6; // 20-26s
  const swayAmount = 30 * balloon.swayDir;

  return (
    <motion.div
      className="absolute z-10"
      style={{ left: `${balloon.x}%`, bottom: 70, transform: 'translateX(-50%)' }}
      initial={{ y: 0, opacity: 0, scale: 0.2 }}
      animate={{
        y: [0, -60, -160, -280, -450],
        opacity: [0, 1, 1, 1, 0],
        scale: [0.2, 1.05, 1, 0.92, 0.65],
        x: [0, swayAmount * 0.4, -swayAmount * 0.3, swayAmount * 0.35, 0],
      }}
      transition={{
        y: { duration: flyDuration, times: [0, 0.06, 0.3, 0.65, 1], ease: [0.2, 0, 0.6, 1] },
        opacity: { duration: flyDuration, times: [0, 0.05, 0.35, 0.9, 1] },
        scale: { duration: flyDuration, times: [0, 0.06, 0.15, 0.75, 1] },
        x: { duration: flyDuration, ease: 'easeInOut' },
      }}
      onAnimationComplete={onDone}
    >
      {/* 线 */}
      <motion.div
        className={`absolute top-full left-1/2 -translate-x-1/2 w-0 border-l border-dashed ${color.string} h-8`}
        animate={{ rotate: [-2, 2, -2] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 气球主体 */}
      <div
        className="relative"
        style={{ width: baseW, height: baseH }}
      >
        {/* 气球形状 */}
        <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${color.body} shadow-lg`}
          style={{ borderRadius: '50% 50% 50% 50% / 45% 45% 55% 55%' }}
        >
          {/* 高光 */}
          <div className={`absolute top-[12%] left-[18%] w-[35%] h-[28%] ${color.highlight} rounded-full blur-[3px]`} />

          {/* 底部收口 */}
          <div className={`absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-3 h-3 bg-gradient-to-b ${color.body} rotate-45 rounded-sm`} />
        </div>

        {/* 文字 */}
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <span className="text-[12px] font-semibold text-white/90 text-center leading-tight line-clamp-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)] max-w-[60px]">
            {balloon.text}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
