'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_FILE_BYTES = 1024 * 1024 * 2; // 2MB safety cap
const MAX_TREE_DEPTH = 8;
const MAX_SEARCH_RESULTS = 1000;

function normalizeRootPath(inputPath) {
  const fallback = os.homedir();
  const rootPath = path.resolve(String(inputPath || fallback));
  return rootPath;
}

function wildcardToRegExp(pattern) {
  const escaped = String(pattern || '*')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function isPathWithinRoot(rootPath, inputPath) {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(inputPath);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertPathAllowed(rootPath, inputPath) {
  const targetPath = path.resolve(String(inputPath || rootPath));
  if (!isPathWithinRoot(rootPath, targetPath)) {
    throw new Error('filesystem-path-outside-root');
  }
  return targetPath;
}

function toFileInfo(entryPath, stat) {
  return {
    path: entryPath,
    name: path.basename(entryPath),
    type: stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
    size: Number(stat.size || 0),
    modifiedAt: stat.mtime?.toISOString?.() || null,
    createdAt: stat.ctime?.toISOString?.() || null,
  };
}

function createFilesystemTools({ rootPath } = {}) {
  const scopedRootPath = normalizeRootPath(rootPath);

  async function read_file(params = {}) {
    const targetPath = assertPathAllowed(scopedRootPath, params.path);
    const stat = await fs.promises.stat(targetPath);
    if (!stat.isFile()) throw new Error('filesystem-not-a-file');
    if (stat.size > MAX_FILE_BYTES) throw new Error('filesystem-file-too-large');
    const content = await fs.promises.readFile(targetPath, 'utf8');
    return { path: targetPath, content, bytes: stat.size };
  }

  async function read_multiple_files(params = {}) {
    const paths = Array.isArray(params.paths) ? params.paths : [];
    const results = [];
    for (const item of paths.slice(0, 100)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const read = await read_file({ path: item });
        results.push({ path: read.path, content: read.content, ok: true });
      } catch (error) {
        results.push({ path: String(item || ''), ok: false, error: String(error?.message || error || 'read-failed') });
      }
    }
    return { files: results };
  }

  async function list_directory(params = {}) {
    const targetPath = assertPathAllowed(scopedRootPath, params.path);
    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    const items = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(targetPath, entry.name);
      const stat = await fs.promises.stat(fullPath).catch(() => null);
      if (!stat) return null;
      return {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        size: Number(stat.size || 0),
      };
    }));
    return {
      path: targetPath,
      items: items.filter(Boolean),
    };
  }

  async function buildDirectoryTree(targetPath, depth) {
    if (depth < 0) return null;
    const stat = await fs.promises.stat(targetPath);
    const node = {
      name: path.basename(targetPath),
      path: targetPath,
      type: stat.isDirectory() ? 'directory' : 'file',
      children: [],
    };
    if (!stat.isDirectory() || depth === 0) return node;
    const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      const childPath = path.join(targetPath, entry.name);
      // eslint-disable-next-line no-await-in-loop
      const childNode = await buildDirectoryTree(childPath, depth - 1).catch(() => null);
      if (childNode) node.children.push(childNode);
    }
    return node;
  }

  async function directory_tree(params = {}) {
    const targetPath = assertPathAllowed(scopedRootPath, params.path);
    const depth = Math.max(0, Math.min(MAX_TREE_DEPTH, Number(params.depth) || 3));
    const tree = await buildDirectoryTree(targetPath, depth);
    return { root: tree };
  }

  async function search_files(params = {}) {
    const startPath = assertPathAllowed(scopedRootPath, params.root || params.path || scopedRootPath);
    const pattern = wildcardToRegExp(params.pattern || params.query || '*');
    const results = [];

    async function walk(currentPath) {
      if (results.length >= MAX_SEARCH_RESULTS) return;
      const entries = await fs.promises.readdir(currentPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (results.length >= MAX_SEARCH_RESULTS) break;
        const fullPath = path.join(currentPath, entry.name);
        if (!isPathWithinRoot(scopedRootPath, fullPath)) continue;
        if (pattern.test(entry.name)) {
          results.push({
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
          });
        }
        if (entry.isDirectory()) {
          // eslint-disable-next-line no-await-in-loop
          await walk(fullPath);
        }
      }
    }

    await walk(startPath);
    return { root: startPath, matches: results };
  }

  async function get_file_info(params = {}) {
    const targetPath = assertPathAllowed(scopedRootPath, params.path);
    const stat = await fs.promises.stat(targetPath);
    return toFileInfo(targetPath, stat);
  }

  return {
    read_file,
    read_multiple_files,
    list_directory,
    directory_tree,
    search_files,
    get_file_info,
    getRootPath: () => scopedRootPath,
  };
}

module.exports = {
  createFilesystemTools,
};
