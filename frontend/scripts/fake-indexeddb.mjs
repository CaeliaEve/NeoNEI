function makeNameList(values) {
  return {
    contains(value) {
      return values().includes(value);
    },
    [Symbol.iterator]() {
      return values()[Symbol.iterator]();
    },
  };
}

class FakeRequest {
  result = undefined;
  error = null;
  onsuccess = null;
  onerror = null;
}

class FakeTransaction {
  error = null;
  oncomplete = null;
  onerror = null;
  onabort = null;
  #pending = 0;
  #finished = false;
  #aborted = false;

  constructor(database, storeNames, mode, factory) {
    this.database = database;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.mode = mode;
    this.factory = factory;
    queueMicrotask(() => this.#maybeComplete());
    if (factory.abortNextTransaction) {
      factory.abortNextTransaction = false;
      queueMicrotask(() => this.abort());
    }
  }

  objectStore(name) {
    const data = this.database.data.stores.get(name);
    if (!data) throw new Error(`Missing fake object store: ${name}`);
    return new FakeObjectStore(data, this);
  }

  beginRequest() {
    if (this.#aborted) throw new Error('Fake transaction is aborted');
    this.#pending += 1;
  }

  finishRequest() {
    this.#pending -= 1;
    this.#maybeComplete();
  }

  fail(error) {
    if (this.#finished || this.#aborted) return;
    this.error = error instanceof Error ? error : new Error(String(error));
    this.#aborted = true;
    queueMicrotask(() => this.onabort?.({ target: this }));
  }

  abort() {
    this.fail(new Error('Fake IndexedDB transaction aborted'));
  }

  #maybeComplete() {
    if (this.#finished || this.#aborted || this.#pending !== 0) return;
    this.#finished = true;
    queueMicrotask(() => this.oncomplete?.({ target: this }));
  }
}

class FakeCursor {
  constructor(request, transaction, store, entries, index) {
    this.request = request;
    this.transaction = transaction;
    this.store = store;
    this.entries = entries;
    this.index = index;
    this.continued = false;
    this.key = entries[index][0];
    this.value = structuredClone(entries[index][1]);
  }

  continue() {
    this.continued = true;
    this.request.emit(this.index + 1);
  }

  delete() {
    this.store.records.delete(this.key);
    return new FakeRequest();
  }

  update(value) {
    this.store.records.set(this.key, structuredClone(value));
    return new FakeRequest();
  }
}

class FakeCursorRequest extends FakeRequest {
  constructor(transaction, store, orderBy) {
    super();
    this.transaction = transaction;
    this.store = store;
    this.orderBy = orderBy;
    this.entries = null;
    transaction.beginRequest();
    this.emit(0);
  }

  emit(index) {
    queueMicrotask(() => {
      if (!this.entries) {
        this.entries = [...this.store.records.entries()];
        if (this.orderBy) {
          this.entries.sort((left, right) => {
            const leftValue = left[1]?.[this.orderBy] ?? 0;
            const rightValue = right[1]?.[this.orderBy] ?? 0;
            return leftValue - rightValue;
          });
        }
      }
      if (index >= this.entries.length) {
        this.result = null;
        this.onsuccess?.({ target: this });
        this.transaction.finishRequest();
        return;
      }
      const cursor = new FakeCursor(this, this.transaction, this.store, this.entries, index);
      this.result = cursor;
      this.onsuccess?.({ target: this });
      if (!cursor.continued) this.transaction.finishRequest();
    });
  }
}

function scheduleRequest(transaction, operation) {
  const request = new FakeRequest();
  transaction.beginRequest();
  queueMicrotask(() => {
    try {
      request.result = operation();
      request.onsuccess?.({ target: request });
    } catch (error) {
      request.error = error;
      request.onerror?.({ target: request });
      transaction.fail(error);
    } finally {
      transaction.finishRequest();
    }
  });
  return request;
}

class FakeIndex {
  constructor(store, transaction, keyPath) {
    this.store = store;
    this.transaction = transaction;
    this.keyPath = keyPath;
  }

  openCursor() {
    return new FakeCursorRequest(this.transaction, this.store, this.keyPath);
  }
}

class FakeObjectStore {
  constructor(data, transaction) {
    this.data = data;
    this.transaction = transaction;
    this.indexNames = makeNameList(() => [...data.indexes.keys()]);
  }

  get records() {
    return this.data.records;
  }

  get(key) {
    return scheduleRequest(this.transaction, () => structuredClone(this.records.get(key)));
  }

  put(value) {
    return scheduleRequest(this.transaction, () => {
      const key = value?.[this.data.keyPath];
      if (key === undefined) throw new Error(`Missing keyPath ${this.data.keyPath}`);
      this.records.set(key, structuredClone(value));
      return key;
    });
  }

  delete(key) {
    return scheduleRequest(this.transaction, () => this.records.delete(key));
  }

  clear() {
    return scheduleRequest(this.transaction, () => this.records.clear());
  }

  count() {
    return scheduleRequest(this.transaction, () => this.records.size);
  }

  openCursor() {
    return new FakeCursorRequest(this.transaction, this.data, null);
  }

  createIndex(name, keyPath) {
    this.data.indexes.set(name, keyPath);
    return new FakeIndex(this.data, this.transaction, keyPath);
  }

  index(name) {
    const keyPath = this.data.indexes.get(name);
    if (!keyPath) throw new Error(`Missing fake index: ${name}`);
    return new FakeIndex(this.data, this.transaction, keyPath);
  }
}

class FakeDatabaseConnection {
  onversionchange = null;

  constructor(data, factory) {
    this.data = data;
    this.factory = factory;
    this.objectStoreNames = makeNameList(() => [...data.stores.keys()]);
    this.upgradeTransaction = null;
  }

  createObjectStore(name, options) {
    const store = {
      keyPath: options?.keyPath ?? 'id',
      records: new Map(),
      indexes: new Map(),
    };
    this.data.stores.set(name, store);
    if (!this.upgradeTransaction) throw new Error('createObjectStore outside upgrade');
    return new FakeObjectStore(store, this.upgradeTransaction);
  }

  transaction(storeNames, mode) {
    return new FakeTransaction(this, storeNames, mode, this.factory);
  }

  close() {}
}

class FakeOpenRequest extends FakeRequest {
  onupgradeneeded = null;
  onblocked = null;
  transaction = null;
}

export class FakeIndexedDBFactory {
  databases = new Map();
  blockNextOpen = false;
  abortNextTransaction = false;

  seedDatabase(name, version, stores) {
    const data = { version, stores: new Map() };
    for (const [storeName, definition] of Object.entries(stores)) {
      data.stores.set(storeName, {
        keyPath: definition.keyPath,
        records: new Map(definition.records.map((record) => [record[definition.keyPath], structuredClone(record)])),
        indexes: new Map(Object.entries(definition.indexes ?? {})),
      });
    }
    this.databases.set(name, data);
  }

  open(name, version) {
    const request = new FakeOpenRequest();
    queueMicrotask(() => {
      if (this.blockNextOpen) {
        this.blockNextOpen = false;
        request.onblocked?.({ target: request });
        return;
      }

      let data = this.databases.get(name);
      const oldVersion = data?.version ?? 0;
      if (!data) {
        data = { version: 0, stores: new Map() };
        this.databases.set(name, data);
      }
      const db = new FakeDatabaseConnection(data, this);
      request.result = db;
      if (version > oldVersion) {
        data.version = version;
        const transaction = new FakeTransaction(db, [...data.stores.keys()], 'versionchange', this);
        request.transaction = transaction;
        db.upgradeTransaction = transaction;
        request.onupgradeneeded?.({ oldVersion, newVersion: version, target: request });
        db.upgradeTransaction = null;
        transaction.oncomplete = () => request.onsuccess?.({ target: request });
        return;
      }
      request.onsuccess?.({ target: request });
    });
    return request;
  }
}

export function createFakeWindow(indexedDB) {
  const values = new Map();
  return {
    indexedDB,
    localStorage: {
      getItem(key) {
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      },
    },
  };
}
