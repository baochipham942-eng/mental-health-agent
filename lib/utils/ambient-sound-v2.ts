/**
 * 多音色环境音引擎 v2
 * 基于 Web Audio API 合成，零音频文件依赖
 * 支持：雨声、海浪、森林、颂钵
 */

export type SoundType = 'rain' | 'ocean' | 'forest' | 'bowl';

export const SOUND_OPTIONS: { type: SoundType; label: string; icon: string }[] = [
  { type: 'rain', label: '雨声', icon: '🌧' },
  { type: 'ocean', label: '海浪', icon: '🌊' },
  { type: 'forest', label: '森林', icon: '🌲' },
  { type: 'bowl', label: '颂钵', icon: '🔔' },
];

// Module-level singleton，防止多个 Widget 创建多个 AudioContext
let instance: AmbientSoundV2 | null = null;

export function getAmbientSound(): AmbientSoundV2 {
  if (!instance) {
    instance = new AmbientSoundV2();
  }
  return instance;
}

export class AmbientSoundV2 {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sourceNodes: AudioNode[] = [];
  private _isPlaying = false;
  private _soundType: SoundType = 'rain';
  private _volume = 0.5; // 0-1
  private fadeOutTimer: ReturnType<typeof setTimeout> | null = null;

  get isPlaying() { return this._isPlaying; }
  get soundType() { return this._soundType; }
  get volume() { return this._volume; }

  /**
   * 开始播放（需在用户手势回调链中调用以满足 iOS Safari 要求）
   */
  start(type?: SoundType) {
    if (type) this._soundType = type;

    // 清除可能存在的淡出定时器
    if (this.fadeOutTimer) {
      clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }

    // 已在播放则切换音色
    if (this._isPlaying) {
      this.switchSound(this._soundType);
      return;
    }

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      // iOS Safari 需要在手势回调中 resume
      this.audioContext.resume();

      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.masterGain.connect(this.audioContext.destination);

      this.buildSoundGraph(this._soundType);

      // 淡入
      this.masterGain.gain.linearRampToValueAtTime(
        this._volume * 0.15, // 环境音最大音量限制在 0.15
        this.audioContext.currentTime + 2
      );

      this._isPlaying = true;
    } catch (e) {
      console.warn('[AmbientV2] Could not start:', e);
    }
  }

  /**
   * 立即停止
   */
  stop() {
    if (!this._isPlaying || !this.audioContext || !this.masterGain) return;

    try {
      this.masterGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.5);
      setTimeout(() => this.cleanup(), 600);
    } catch (e) {
      this.cleanup();
    }
  }

  /**
   * 2 秒淡出后停止（练习结束时使用）
   */
  fadeOutAndStop() {
    if (!this._isPlaying || !this.audioContext || !this.masterGain) return;

    try {
      this.masterGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 2);
      this.fadeOutTimer = setTimeout(() => {
        this.cleanup();
        this.fadeOutTimer = null;
      }, 2200);
    } catch (e) {
      this.cleanup();
    }
  }

  /**
   * 切换音色（播放中调用）
   */
  switchSound(type: SoundType) {
    if (!this.audioContext || !this.masterGain) return;
    this._soundType = type;

    // 淡出旧音色
    this.masterGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.15);

    setTimeout(() => {
      if (!this.audioContext || !this.masterGain) return;
      // 断开旧节点
      this.disconnectSources();
      // 构建新音色
      this.buildSoundGraph(type);
      // 淡入新音色
      this.masterGain.gain.linearRampToValueAtTime(
        this._volume * 0.15,
        this.audioContext.currentTime + 0.3
      );
    }, 180);
  }

  /**
   * 设置音量 (0-1)
   */
  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.audioContext && this.masterGain && this._isPlaying) {
      this.masterGain.gain.linearRampToValueAtTime(
        this._volume * 0.15,
        this.audioContext.currentTime + 0.1
      );
    }
  }

  // ============ 音色合成 ============

  private buildSoundGraph(type: SoundType) {
    if (!this.audioContext || !this.masterGain) return;

    switch (type) {
      case 'rain': this.buildRain(); break;
      case 'ocean': this.buildOcean(); break;
      case 'forest': this.buildForest(); break;
      case 'bowl': this.buildBowl(); break;
    }
  }

  /**
   * 雨声：白噪音 + lowpass 滤波
   */
  private buildRain() {
    const ctx = this.audioContext!;
    const noiseBuffer = this.createNoiseBuffer(2);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    // Lowpass 滤波模拟雨声频谱
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.Q.setValueAtTime(0.7, ctx.currentTime);

    // 轻微 LFO 调制滤波器频率，模拟雨势变化
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
    lfoGain.gain.setValueAtTime(200, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    source.connect(filter);
    filter.connect(this.masterGain!);
    lfo.start();
    source.start();

    this.sourceNodes.push(source, lfo);
  }

  /**
   * 海浪：低频噪音 + 慢速振幅 LFO 模拟潮汐
   */
  private buildOcean() {
    const ctx = this.audioContext!;
    const noiseBuffer = this.createNoiseBuffer(4);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    // Bandpass 滤波
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.Q.setValueAtTime(0.5, ctx.currentTime);

    // 振幅 LFO 模拟浪潮起伏
    const ampLfo = ctx.createOscillator();
    const ampGain = ctx.createGain();
    ampLfo.type = 'sine';
    ampLfo.frequency.setValueAtTime(0.08, ctx.currentTime); // 约 12 秒一个浪
    ampGain.gain.setValueAtTime(0.5, ctx.currentTime);

    const waveGain = ctx.createGain();
    waveGain.gain.setValueAtTime(0.5, ctx.currentTime);

    ampLfo.connect(ampGain);
    ampGain.connect(waveGain.gain);

    source.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(this.masterGain!);
    ampLfo.start();
    source.start();

    this.sourceNodes.push(source, ampLfo);
  }

  /**
   * 森林：中频噪音 + 随机颤音模拟风声
   */
  private buildForest() {
    const ctx = this.audioContext!;

    // 基底：中频噪音（风声）
    const noiseBuffer = this.createNoiseBuffer(2);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.Q.setValueAtTime(1.2, ctx.currentTime);

    // 风声振幅调制
    const windLfo = ctx.createOscillator();
    const windGain = ctx.createGain();
    windLfo.type = 'sine';
    windLfo.frequency.setValueAtTime(0.2, ctx.currentTime);
    windGain.gain.setValueAtTime(0.3, ctx.currentTime);

    const forestGain = ctx.createGain();
    forestGain.gain.setValueAtTime(0.4, ctx.currentTime);

    windLfo.connect(windGain);
    windGain.connect(forestGain.gain);

    source.connect(filter);
    filter.connect(forestGain);
    forestGain.connect(this.masterGain!);

    // 高频层：模拟远处鸟鸣/树叶
    const highNoise = ctx.createBufferSource();
    highNoise.buffer = this.createNoiseBuffer(1);
    highNoise.loop = true;

    const highFilter = ctx.createBiquadFilter();
    highFilter.type = 'highpass';
    highFilter.frequency.setValueAtTime(2000, ctx.currentTime);
    highFilter.Q.setValueAtTime(2, ctx.currentTime);

    const highGain = ctx.createGain();
    highGain.gain.setValueAtTime(0.08, ctx.currentTime);

    highNoise.connect(highFilter);
    highFilter.connect(highGain);
    highGain.connect(this.masterGain!);

    windLfo.start();
    source.start();
    highNoise.start();

    this.sourceNodes.push(source, windLfo, highNoise);
  }

  /**
   * 颂钵：保留原 AmbientSound 的 396Hz 正弦波 + LFO
   */
  private buildBowl() {
    const ctx = this.audioContext!;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(396, ctx.currentTime);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.1, ctx.currentTime);
    lfoGain.gain.setValueAtTime(10, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(this.masterGain!);
    lfo.start();
    osc.start();

    this.sourceNodes.push(osc, lfo);
  }

  // ============ 工具方法 ============

  private createNoiseBuffer(durationSec: number): AudioBuffer {
    const ctx = this.audioContext!;
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * durationSec;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private disconnectSources() {
    for (const node of this.sourceNodes) {
      try {
        (node as any).stop?.();
        node.disconnect();
      } catch (e) { /* ignore */ }
    }
    this.sourceNodes = [];
  }

  private cleanup() {
    this.disconnectSources();
    try {
      this.masterGain?.disconnect();
      this.audioContext?.close();
    } catch (e) { /* ignore */ }
    this.audioContext = null;
    this.masterGain = null;
    this._isPlaying = false;
  }
}
