/**
 * In-memory mock of the expo-file-system (SDK 54+) class-based API,
 * covering the surface DownloadService uses: File, Directory, Paths, FileHandle.
 */

// uri -> { type: 'file', data: Uint8Array } | { type: 'dir' }
let entries = new Map();
let availableDiskSpace = Number.MAX_SAFE_INTEGER;

const DOCUMENT_URI = 'file:///mock-documents';

const normalize = (uri) => uri.replace(/\/+$/, '');

const resolveUri = (parentOrUri, name) => {
  if (name === undefined) {
    return normalize(typeof parentOrUri === 'string' ? parentOrUri : parentOrUri.uri);
  }
  const base = normalize(typeof parentOrUri === 'string' ? parentOrUri : parentOrUri.uri);
  return `${base}/${name}`;
};

class FileHandle {
  constructor(file) {
    this._file = file;
    this.offset = 0;
  }

  writeBytes(bytes) {
    const entry = entries.get(this._file.uri);
    if (!entry || entry.type !== 'file') {
      throw new Error(`File does not exist: ${this._file.uri}`);
    }
    const start = this.offset ?? entry.data.length;
    const end = start + bytes.length;
    const next = new Uint8Array(Math.max(entry.data.length, end));
    next.set(entry.data);
    next.set(bytes, start);
    entry.data = next;
    this.offset = end;
  }

  readBytes(length) {
    const entry = entries.get(this._file.uri);
    const start = this.offset ?? 0;
    const result = entry.data.slice(start, start + length);
    this.offset = start + result.length;
    return result;
  }

  close() {}

  get size() {
    return entries.get(this._file.uri)?.data.length ?? null;
  }
}

class File {
  constructor(parentOrUri, name) {
    this.uri = resolveUri(parentOrUri, name);
  }

  get name() {
    return this.uri.split('/').pop();
  }

  get exists() {
    return entries.get(this.uri)?.type === 'file';
  }

  get size() {
    return entries.get(this.uri)?.data.length ?? 0;
  }

  create(options = {}) {
    if (this.exists && !options.overwrite) {
      throw new Error(`File already exists: ${this.uri}`);
    }
    entries.set(this.uri, { type: 'file', data: new Uint8Array(0) });
  }

  write(content) {
    const data =
      typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
    entries.set(this.uri, { type: 'file', data });
  }

  bytes() {
    return Promise.resolve(entries.get(this.uri)?.data ?? new Uint8Array(0));
  }

  bytesSync() {
    return entries.get(this.uri)?.data ?? new Uint8Array(0);
  }

  delete() {
    if (!entries.has(this.uri)) {
      throw new Error(`File does not exist: ${this.uri}`);
    }
    entries.delete(this.uri);
  }

  move(destination) {
    const entry = entries.get(this.uri);
    if (!entry) {
      throw new Error(`File does not exist: ${this.uri}`);
    }
    const destUri =
      destination instanceof Directory ? resolveUri(destination, this.name) : destination.uri;
    entries.delete(this.uri);
    entries.set(destUri, entry);
    this.uri = destUri;
  }

  open() {
    if (!this.exists) {
      throw new Error(`File does not exist: ${this.uri}`);
    }
    return new FileHandle(this);
  }
}

class Directory {
  constructor(parentOrUri, name) {
    this.uri = resolveUri(parentOrUri, name);
  }

  get name() {
    return this.uri.split('/').pop();
  }

  get exists() {
    return entries.get(this.uri)?.type === 'dir';
  }

  create(options = {}) {
    if (this.exists && !options.idempotent && !options.overwrite) {
      throw new Error(`Directory already exists: ${this.uri}`);
    }
    entries.set(this.uri, { type: 'dir' });
  }

  list() {
    const prefix = `${this.uri}/`;
    const children = [];
    entries.forEach((entry, uri) => {
      if (!uri.startsWith(prefix)) return;
      // Direct children only
      if (uri.slice(prefix.length).includes('/')) return;
      children.push(entry.type === 'file' ? new File(uri) : new Directory(uri));
    });
    return children;
  }

  delete() {
    const prefix = `${this.uri}/`;
    [...entries.keys()].forEach((uri) => {
      if (uri === this.uri || uri.startsWith(prefix)) {
        entries.delete(uri);
      }
    });
  }
}

class Paths {
  static get document() {
    const dir = new Directory(DOCUMENT_URI);
    entries.set(DOCUMENT_URI, { type: 'dir' });
    return dir;
  }

  static get cache() {
    const dir = new Directory('file:///mock-cache');
    entries.set('file:///mock-cache', { type: 'dir' });
    return dir;
  }

  static get availableDiskSpace() {
    return availableDiskSpace;
  }
}

// --- Test helpers (not part of the real API) ---
const __mock = {
  reset() {
    entries = new Map();
    availableDiskSpace = Number.MAX_SAFE_INTEGER;
  },
  setAvailableDiskSpace(bytes) {
    availableDiskSpace = bytes;
  },
  listAll() {
    return [...entries.keys()];
  },
  getFileData(uri) {
    return entries.get(uri)?.data ?? null;
  },
  seedFile(uri, data) {
    entries.set(normalize(uri), { type: 'file', data: new Uint8Array(data) });
  },
  documentUri: DOCUMENT_URI,
};

module.exports = { File, Directory, Paths, FileHandle, __mock };
