// AudioWorklet processor: downmixes input channels to mono and posts Float32 chunks
// (about 20 ms each, at the context sample rate) to the main thread.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.max(128, Math.round(sampleRate * 0.02));
    this.buf = new Float32Array(this.size);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0];
    if (!ch || !ch.length) return true;
    const frames = ch[0].length;
    for (let i = 0; i < frames; i++) {
      let s = 0;
      for (let c = 0; c < ch.length; c++) s += ch[c][i];
      this.buf[this.n++] = s / ch.length;
      if (this.n === this.size) {
        const out = this.buf;
        this.port.postMessage({ samples: out, rate: sampleRate }, [out.buffer]);
        this.buf = new Float32Array(this.size);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("capture-processor", CaptureProcessor);
