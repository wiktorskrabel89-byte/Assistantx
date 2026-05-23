/**
 * Drop Handler — local file drag-and-drop indexing into the sidecar vector DB.
 *
 * Design decisions:
 *  - Only local files are indexed in v1 (no cloud sync).
 *  - Files are sent to the ai-agent sidecar via WebSocket (memory_upsert).
 *  - Ignored: binary files, files > 10 MB, hidden files (dot-prefix).
 *  - Supported text/code types are extracted as UTF-8 and chunked if large.
 *  - Job queue with per-job progress is maintained in-memory and reported via IPC.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const CHUNK_SIZE_CHARS = 4000;               // chars per vector chunk
const CHUNK_OVERLAP_CHARS = 200;             // overlap between chunks

// Allowed text/code extensions (lower-case)
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.rst',
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.cs',
  '.html', '.htm', '.css', '.scss', '.less',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.sh', '.bash', '.zsh', '.ps1',
  '.sql', '.graphql', '.proto',
  '.xml', '.csv',
  '.tf', '.hcl',
  '.dockerfile', '.conf',
]);

// File name patterns to ignore (security + noise)
const IGNORE_PATTERNS = [
  /^\./, // hidden files
  /node_modules/,
  /\.git[/\\]/,
  /\.(exe|dll|bin|so|dylib|dmg|pkg|msi|apk|ipa)$/i,
  /\.(jpg|jpeg|png|gif|webp|bmp|ico|svg|mp4|mp3|wav|pdf|zip|tar|gz|7z)$/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateJobId() {
  return `idx-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function shouldIgnore(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return IGNORE_PATTERNS.some((p) => p.test(normalized));
}

function isAllowedExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) || ext === '';
}

function chunkText(text, chunkSize = CHUNK_SIZE_CHARS, overlap = CHUNK_OVERLAP_CHARS) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start >= text.length - overlap) break;
  }
  return chunks;
}

/** Recursively collect eligible files from a list of paths (files or dirs). */
function collectFiles(inputPaths) {
  const result = [];
  for (const inputPath of inputPaths) {
    try {
      const stat = fs.statSync(inputPath);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(inputPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(inputPath, entry.name);
          if (entry.isFile() || entry.isDirectory()) {
            result.push(...collectFiles([fullPath]));
          }
        }
      } else if (stat.isFile()) {
        if (!shouldIgnore(inputPath) && isAllowedExtension(inputPath) && stat.size <= MAX_FILE_SIZE_BYTES) {
          result.push({ filePath: inputPath, size: stat.size });
        }
      }
    } catch {
      // Permission error or path not found — skip
    }
  }
  return result;
}

// ─── DropHandler class ────────────────────────────────────────────────────────

class DropHandler extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, import('./types').IndexJob>} */
    this._jobs = new Map();
    /** WebSocket reference to the sidecar (set externally). */
    this._sidecarWs = null;
  }

  /** Provide a live WebSocket to the ai-agent sidecar. */
  setSidecarWs(ws) {
    this._sidecarWs = ws;
  }

  /** Accept an array of file/folder paths dropped by the user. */
  async addDrop(inputPaths) {
    const files = collectFiles(inputPaths);
    if (files.length === 0) {
      return { jobId: null, fileCount: 0, skippedPaths: inputPaths };
    }

    const jobId = generateJobId();
    const job = {
      id: jobId,
      status: 'pending',   // 'pending' | 'running' | 'completed' | 'cancelled' | 'error'
      totalFiles: files.length,
      processedFiles: 0,
      errorFiles: 0,
      chunks: 0,
      startedAt: Date.now(),
      completedAt: null,
      files: files.map((f) => ({ path: f.filePath, size: f.size, status: 'pending' })),
      error: null,
    };
    this._jobs.set(jobId, job);
    this._emit(job);

    // Run indexing asynchronously
    this._runJob(job).catch((err) => {
      job.status = 'error';
      job.error = err?.message ?? String(err);
      job.completedAt = Date.now();
      this._emit(job);
    });

    return { jobId, fileCount: files.length };
  }

  /** Cancel a running or pending job. */
  cancelJob(jobId) {
    const job = this._jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'cancelled') return false;
    job.status = 'cancelled';
    job.completedAt = Date.now();
    this._emit(job);
    return true;
  }

  /** Get current state of all jobs (most recent first, max 50). */
  getJobs() {
    return [...this._jobs.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 50)
      .map((j) => this._publicJob(j));
  }

  /** Get a single job by id. */
  getJob(jobId) {
    const job = this._jobs.get(jobId);
    return job ? this._publicJob(job) : null;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  async _runJob(job) {
    job.status = 'running';
    this._emit(job);

    for (const fileEntry of job.files) {
      if (job.status === 'cancelled') break;

      try {
        const content = fs.readFileSync(fileEntry.path, 'utf-8');
        const chunks = chunkText(content);
        for (let i = 0; i < chunks.length; i++) {
          if (job.status === 'cancelled') break;
          await this._upsertChunk({
            filePath: fileEntry.path,
            chunkIndex: i,
            totalChunks: chunks.length,
            content: chunks[i],
          });
          job.chunks += 1;
        }
        fileEntry.status = 'done';
        job.processedFiles += 1;
      } catch (err) {
        fileEntry.status = 'error';
        fileEntry.error = err?.message ?? String(err);
        job.errorFiles += 1;
        job.processedFiles += 1;
      }

      this._emit(job);
    }

    if (job.status !== 'cancelled') {
      job.status = job.errorFiles === 0 ? 'completed' : 'completed';
      job.completedAt = Date.now();
      this._emit(job);
    }
  }

  /** Send a single text chunk to the sidecar via WebSocket memory_upsert. */
  _upsertChunk({ filePath, chunkIndex, totalChunks, content }) {
    return new Promise((resolve, reject) => {
      const ws = this._sidecarWs;
      if (!ws || ws.readyState !== 1 /* OPEN */) {
        // Sidecar not connected — degrade gracefully by skipping
        resolve();
        return;
      }

      const msgId = `${Date.now()}-${chunkIndex}`;
      const payload = JSON.stringify({
        type: 'memory_upsert',
        id: msgId,
        content,
        metadata: {
          source: 'file-drop',
          filePath,
          chunkIndex,
          totalChunks,
          indexedAt: new Date().toISOString(),
        },
      });

      try {
        ws.send(payload);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  _publicJob(job) {
    return {
      id: job.id,
      status: job.status,
      totalFiles: job.totalFiles,
      processedFiles: job.processedFiles,
      errorFiles: job.errorFiles,
      chunks: job.chunks,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      progressPercent: job.totalFiles > 0
        ? Math.round((job.processedFiles / job.totalFiles) * 100)
        : 0,
    };
  }

  _emit(job) {
    this.emit('job-update', this._publicJob(job));
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

const dropHandler = new DropHandler();
module.exports = { dropHandler, collectFiles, ALLOWED_EXTENSIONS };
