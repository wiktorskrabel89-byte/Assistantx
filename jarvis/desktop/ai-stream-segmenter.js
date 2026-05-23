'use strict';

const DEFAULT_MIN_WORDS = 6;
const DEFAULT_MAX_WORDS = 16;
const DEFAULT_MAX_CHARS = 280;
const TERMINAL_PUNCTUATION = /[.!?]\s*$/;
const SOFT_PUNCTUATION = /[,;:]\s*$/;

class AiStreamSegmenter {
  constructor(options = {}) {
    this.minWords = clampInt(options.minWords, 1, 50, DEFAULT_MIN_WORDS);
    this.maxWords = clampInt(options.maxWords, this.minWords, 80, DEFAULT_MAX_WORDS);
    this.maxChars = clampInt(options.maxChars, 40, 1000, DEFAULT_MAX_CHARS);
    this._buffer = '';
  }

  pushToken(token) {
    const next = String(token || '');
    if (!next) return [];
    this._buffer += next;
    return this._drainSegments(false);
  }

  flush() {
    return this._drainSegments(true);
  }

  _drainSegments(forceFlush) {
    const segments = [];
    while (true) {
      const candidate = this._nextBoundary(forceFlush);
      if (!candidate) break;
      this._buffer = this._buffer.slice(candidate.length);
      const normalized = normalizeChunk(candidate);
      if (normalized) segments.push(normalized);
      if (!this._buffer) break;
    }
    return segments;
  }

  _nextBoundary(forceFlush) {
    const value = this._buffer;
    if (!value) return '';
    const words = countWords(value);
    if (words < this.minWords && !forceFlush) return '';

    const punctuationIndex = findBoundaryIndex(value, TERMINAL_PUNCTUATION)
      ?? findBoundaryIndex(value, SOFT_PUNCTUATION);
    if (punctuationIndex !== null && words >= this.minWords) {
      return value.slice(0, punctuationIndex + 1);
    }

    if (words >= this.maxWords || value.length >= this.maxChars) {
      const fallback = findWordBoundary(value, this.maxWords);
      if (fallback > 0) return value.slice(0, fallback);
      return value;
    }

    if (forceFlush) return value;
    return '';
  }
}

function normalizeChunk(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function countWords(value) {
  const normalized = normalizeChunk(value);
  if (!normalized) return 0;
  return normalized.split(' ').filter(Boolean).length;
}

function findWordBoundary(value, maxWords) {
  if (!value) return -1;
  let words = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\s/.test(value[index])) {
      words += 1;
      if (words >= maxWords) return index + 1;
    }
  }
  return value.length;
}

function findBoundaryIndex(value, pattern) {
  if (!value) return null;
  for (let index = Math.min(value.length, 5000) - 1; index >= 0; index -= 1) {
    const snippet = value.slice(0, index + 1);
    if (pattern.test(snippet)) return index;
  }
  return null;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

module.exports = {
  AiStreamSegmenter,
  normalizeChunk,
};
