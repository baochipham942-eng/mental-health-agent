/**
 * 环境音管理器 - 持续播放柔和的背景音
 * 共享模块，供 BreathingExercise / MeditationExercise 等 Widget 复用
 */
export class AmbientSound {
  private audioContext: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private lfoGain: GainNode | null = null;
  private isPlaying = false;

  start() {
    if (this.isPlaying) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // 主音：低沉的 396Hz（解放频率）
      this.oscillator = this.audioContext.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(396, this.audioContext.currentTime);

      // LFO 调制 - 模拟自然的起伏
      const lfo = this.audioContext.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.1, this.audioContext.currentTime); // 很慢的调制

      this.lfoGain = this.audioContext.createGain();
      this.lfoGain.gain.setValueAtTime(10, this.audioContext.currentTime); // 调制深度

      lfo.connect(this.lfoGain);
      this.lfoGain.connect(this.oscillator.frequency);

      // 主增益 - 淡入
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(0.08, this.audioContext.currentTime + 2); // 柔和音量

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      lfo.start();
      this.oscillator.start();
      this.isPlaying = true;
    } catch (e) {
      console.warn('[Ambient] Could not start ambient sound:', e);
    }
  }

  stop() {
    if (!this.isPlaying || !this.audioContext || !this.gainNode || !this.oscillator) return;

    try {
      // 淡出
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1);

      // 延迟停止
      setTimeout(() => {
        try {
          this.oscillator?.stop();
          this.audioContext?.close();
        } catch (e) { }
        this.audioContext = null;
        this.oscillator = null;
        this.gainNode = null;
        this.lfoGain = null;
        this.isPlaying = false;
      }, 1100);
    } catch (e) {
      console.warn('[Ambient] Could not stop ambient sound:', e);
    }
  }
}

/**
 * 使用 Web Audio API 播放柔和的颂钵/钟声提示音
 */
export function playCompletionSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // 创建振荡器 - 颂钵基音
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(528, audioContext.currentTime); // 528Hz - 愈合频率

    // 创建包络增益节点
    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1); // 淡入
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 2); // 缓慢淡出

    // 连接节点
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // 播放
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 2);

    // 清理
    oscillator.onended = () => {
      audioContext.close();
    };
  } catch (e) {
    console.warn('[Audio] Could not play completion sound:', e);
  }
}
