/**
 * ترميز الصوت — PCM الخام من Gemini إلى MP3 خفيف صديق للشبكات
 * (24kHz mono CBR 64kbps ≈ 0.5MB/دقيقة) عبر @breezystack/lamejs.
 * بدل نقطة فشل واحدة: إن تعذر الترميز نهائيًا لف أي عملية إلى غلاف WAV
 * مضمون البناء (نفس معدل العينات) — والصيغة تُثبت لكل عملية توليد كاملة
 * حتى تظل concat الأجزاء متجانسًا.
 */

import { Mp3Encoder } from "@breezystack/lamejs";

export const SAMPLE_RATE = 24000;

export type EncodedAudio = {
  bytes: Buffer;
  mime: "audio/mpeg" | "audio/wav";
  ext: "mp3" | "wav";
};

/** مدة بالثواني من عدد عينات PCM */
export function pcmDurationSec(pcm: Buffer, sampleRate = SAMPLE_RATE): number {
  return pcm.length / 2 / sampleRate; // 16-bit mono = 2 بايت للعينة
}

function pcmToMp3(pcm: Buffer): Buffer {
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, 64);
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const parts: Buffer[] = [];
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, Math.min(i + blockSize, samples.length));
    const buf = encoder.encodeBuffer(chunk);
    if (buf.length) parts.push(Buffer.from(buf));
  }
  const end = encoder.flush();
  if (end.length) parts.push(Buffer.from(end));
  return Buffer.concat(parts);
}

function pcmToWav(pcm: Buffer, sampleRate = SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/* الوضع يُثبت مرة واحدة لكل عملية تشغيل حتى تبقى أجزاء المقال متجانسة */
let mode: "mp3" | "wav" | null = null;

export function encodeNarration(pcm: Buffer): EncodedAudio {
  if (mode === null) {
    try {
      const probe = pcmToMp3(pcm.subarray(0, Math.min(pcm.length, SAMPLE_RATE * 2)));
      mode = probe.length > 64 ? "mp3" : "wav";
    } catch {
      mode = "wav";
    }
  }
  if (mode === "mp3") {
    return { bytes: pcmToMp3(pcm), mime: "audio/mpeg", ext: "mp3" };
  }
  return { bytes: pcmToWav(pcm), mime: "audio/wav", ext: "wav" };
}
