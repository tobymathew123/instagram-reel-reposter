'use strict';
/**
 * Core video branding logic.
 *
 * Takes a source video (or image) + a 1080x1920 transparent PNG frame made in Canva
 * and produces an Instagram-Reels-compliant MP4:
 *   - 1080x1920 (9:16), source scaled to fit and padded with black
 *   - Canva frame composited on top
 *   - H.264 High profile, yuv420p, 30 fps, AAC 48 kHz stereo audio
 *   - "faststart" (moov atom at the front) so Meta can process it quickly
 *
 * Note: the original blueprint used `-c:a copy`. We re-encode audio to AAC instead,
 * because Instagram rejects many source audio codecs and silent videos with no audio
 * track at all. This makes publishing far more reliable.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const DATA_DIR = process.env.DATA_DIR || '/data';
const OUTPUT_DIR = path.join(DATA_DIR, 'output');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const BRANDING_DIR = process.env.BRANDING_DIR || '/branding';
const LOCAL_FRAME_FILE = path.join(BRANDING_DIR, 'frame.png');

const MAX_DOWNLOAD_BYTES = Number(process.env.MAX_DOWNLOAD_MB || 500) * 1024 * 1024;
const MAX_VIDEO_SECONDS = Number(process.env.MAX_VIDEO_SECONDS || 900); // Reels API limit is 15 min
const IMAGE_VIDEO_SECONDS = Number(process.env.IMAGE_VIDEO_SECONDS || 8); // for photo posts
const FFMPEG_TIMEOUT_MS = Number(process.env.FFMPEG_TIMEOUT_SECONDS || 900) * 1000;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

class RenderError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function safeId(id) {
  const cleaned = String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return cleaned || `reel_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

async function download(url, dest) {
  if (!/^https?:\/\//i.test(url)) throw new RenderError(`Not a valid http(s) URL: ${url}`, 400);
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' },
      signal: AbortSignal.timeout(5 * 60 * 1000),
    });
  } catch (err) {
    throw new RenderError(`Could not download ${shorten(url)}: ${err.message}`, 502);
  }
  if (!res.ok || !res.body) {
    throw new RenderError(
      `Download failed (HTTP ${res.status}) for ${shorten(url)}. ` +
        'If this is a Reel from a private or restricted account, Instagram does not allow it to be downloaded.',
      502
    );
  }
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > MAX_DOWNLOAD_BYTES) {
    throw new RenderError(`File too large (${Math.round(declared / 1e6)} MB)`, 413);
  }
  let received = 0;
  const limiter = new (require('stream').Transform)({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > MAX_DOWNLOAD_BYTES) return cb(new RenderError('File too large', 413));
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body), limiter, fs.createWriteStream(dest));
  if (received === 0) throw new RenderError(`Downloaded file is empty: ${shorten(url)}`, 502);
  return { contentType: res.headers.get('content-type') || '', bytes: received };
}

function shorten(url) {
  const s = String(url);
  return s.length > 90 ? `${s.slice(0, 87)}...` : s;
}

function run(cmd, args, timeoutMs = FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new RenderError(`${cmd} timed out after ${timeoutMs / 1000}s`, 504));
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new RenderError(`Could not start ${cmd}: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new RenderError(`${cmd} failed (exit ${code}): ${stderr.split('\n').slice(-8).join(' | ')}`));
    });
  });
}

async function probe(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name:format=duration,format_name',
    '-of', 'json',
    file,
  ], 60000);
  const info = JSON.parse(stdout || '{}');
  const streams = info.streams || [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const duration = Number(info.format && info.format.duration) || 0;
  const imageCodecs = ['mjpeg', 'png', 'webp', 'bmp', 'gif', 'tiff'];
  const isImage = !!video && (imageCodecs.includes(video.codec_name) || duration === 0) && !audio;
  if (!video) throw new RenderError('The shared file has no video or image in it.', 422);
  return { hasAudio: !!audio, duration, isImage };
}

async function resolveFrame(frame, workDir) {
  if (frame && /^https?:\/\//i.test(frame)) {
    const dest = path.join(workDir, 'frame.png');
    await download(frame, dest);
    return dest;
  }
  if (fs.existsSync(LOCAL_FRAME_FILE)) return LOCAL_FRAME_FILE;
  throw new RenderError(
    'No Canva frame found. Put your PNG at branding/frame.png in the project folder, ' +
      'or set CANVA_FRAME_PNG_URL in the .env file.',
    400
  );
}

/**
 * @param {object} opts
 * @param {string} [opts.source]      http(s) URL of the source video/image
 * @param {string} [opts.sourceFile]  OR a local file path (used by the test tools)
 * @param {string} [opts.frame]       http(s) URL of the PNG, or "local"/empty for branding/frame.png
 * @param {string} [opts.jobId]
 * @param {string} [opts.outputName]  override output file name (without .mp4)
 */
async function render(opts) {
  const id = safeId(opts.jobId);
  const workDir = path.join(TMP_DIR, `${id}_${crypto.randomBytes(3).toString('hex')}`);
  await fsp.mkdir(workDir, { recursive: true });
  const started = Date.now();
  try {
    let src = opts.sourceFile;
    if (!src) {
      if (!opts.source) throw new RenderError('Missing "source" (the Reel video URL).', 400);
      src = path.join(workDir, 'source');
      await download(opts.source, src);
    }
    const framePath = await resolveFrame(opts.frame, workDir);
    const info = await probe(src);

    const outName = `${safeId(opts.outputName || id)}.mp4`;
    const tmpOut = path.join(workDir, outName);
    const finalOut = path.join(OUTPUT_DIR, outName);

    const outDuration = info.isImage
      ? IMAGE_VIDEO_SECONDS
      : Math.min(info.duration || MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS);

    const args = ['-y', '-hide_banner', '-loglevel', 'error'];
    // input 0: the reel (or a still image looped into a short video)
    if (info.isImage) args.push('-loop', '1', '-t', String(IMAGE_VIDEO_SECONDS));
    args.push('-i', src);
    // input 1: the Canva frame
    args.push('-i', framePath);
    // input 2 (only if needed): silent audio so Instagram always gets an audio track
    if (!info.hasAudio) {
      args.push('-f', 'lavfi', '-t', String(outDuration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    }

    const filter = [
      '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,',
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30[bg];',
      '[1:v]scale=1080:1920,format=rgba[fr];',
      '[bg][fr]overlay=0:0:format=auto,format=yuv420p[v]',
    ].join('');

    args.push(
      '-filter_complex', filter,
      '-map', '[v]',
      '-map', info.hasAudio ? '0:a:0' : '2:a:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-level', '4.1',
      '-crf', '20', '-maxrate', '8M', '-bufsize', '16M', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
      '-t', String(outDuration),
      '-shortest',
      '-movflags', '+faststart',
      tmpOut
    );

    await run('ffmpeg', args);
    await fsp.rename(tmpOut, finalOut).catch(async () => {
      await fsp.copyFile(tmpOut, finalOut);
    });
    const stat = await fsp.stat(finalOut);
    return {
      filename: outName,
      sizeBytes: stat.size,
      durationSec: Math.round(outDuration * 10) / 10,
      sourceHadAudio: info.hasAudio,
      sourceWasImage: info.isImage,
      renderSeconds: Math.round((Date.now() - started) / 100) / 10,
    };
  } finally {
    fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Delete rendered files older than ttlHours. */
async function cleanup(ttlHours) {
  const cutoff = Date.now() - ttlHours * 3600 * 1000;
  for (const dir of [OUTPUT_DIR, TMP_DIR]) {
    let entries = [];
    try {
      entries = await fsp.readdir(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith('sample-')) continue; // keep test samples
      const p = path.join(dir, name);
      try {
        const st = await fsp.stat(p);
        if (st.mtimeMs < cutoff) await fsp.rm(p, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = { render, cleanup, run, RenderError, OUTPUT_DIR, TMP_DIR, LOCAL_FRAME_FILE };
