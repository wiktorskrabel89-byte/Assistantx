'use strict';

const path = require('path');

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateAction(action) {
  if (!isPlainObject(action)) return { ok: false, reason: 'action-must-be-object' };
  if (typeof action.tool !== 'string' || !action.tool.trim()) return { ok: false, reason: 'tool-name-required' };
  if (action.params !== undefined && !isPlainObject(action.params)) return { ok: false, reason: 'params-must-be-object' };
  return { ok: true };
}

function validatePathParam(targetPath, { allowRelative = true, maxLength = 4096 } = {}) {
  if (targetPath === undefined || targetPath === null || targetPath === '') {
    return { ok: true, value: '' };
  }
  if (typeof targetPath !== 'string') return { ok: false, reason: 'path-must-be-string' };
  const value = targetPath.trim();
  if (!value) return { ok: true, value: '' };
  if (value.length > maxLength) return { ok: false, reason: 'path-too-long' };
  if (!allowRelative && !path.isAbsolute(value)) return { ok: false, reason: 'path-must-be-absolute' };
  if (/[\0]/.test(value)) return { ok: false, reason: 'path-invalid-null-byte' };
  return { ok: true, value };
}

function validateUrlParam(url) {
  if (url === undefined || url === null || url === '') return { ok: true, value: '' };
  if (typeof url !== 'string') return { ok: false, reason: 'url-must-be-string' };
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, reason: 'unsupported-url-protocol' };
    return { ok: true, value: parsed.toString() };
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
}

function validateParams(params = {}) {
  if (!isPlainObject(params)) return { ok: false, reason: 'params-must-be-object' };
  const pathKeys = ['path', 'targetPath', 'filePath'];
  for (const key of pathKeys) {
    if (key in params) {
      const checked = validatePathParam(params[key]);
      if (!checked.ok) return { ok: false, reason: `${key}:${checked.reason}` };
    }
  }

  const urlKeys = ['url', 'endpoint'];
  for (const key of urlKeys) {
    if (key in params) {
      const checked = validateUrlParam(params[key]);
      if (!checked.ok) return { ok: false, reason: `${key}:${checked.reason}` };
    }
  }

  return { ok: true };
}

module.exports = {
  validateAction,
  validateParams,
  validatePathParam,
  validateUrlParam,
};
