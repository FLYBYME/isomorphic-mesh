import { Env } from './Env';

interface QueuedRPC {
    id: string;
    targetId: string;
    topic: string;
    data: any;
    timestamp: number;
}

/**
 * OfflineStorageEngine — uses IndexedDB to queue failed RPCs when disconnected.
 */
export class OfflineStorageEngine {
    private db: IDBDatabase | null = null;
    private readonly DB_NAME = 'isomorphic_mesh_offline';
    private readonly STORE_NAME = 'rpc_queue';

    async init(): Promise<void> {
        if (!Env.isBrowser()) return;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);

            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event: any) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event: any) => {
                reject(new Error(`IndexedDB error: ${event.target.error}`));
            };
        });
    }

    async queue(rpc: QueuedRPC): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.add(rpc);

            request.onsuccess = () => resolve();
            request.onerror = (event: any) => reject(event.target.error);
        });
    }

    async getAll(): Promise<QueuedRPC[]> {
        if (!this.db) return [];

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = (event: any) => resolve(event.target.result);
            request.onerror = (event: any) => reject(event.target.error);
        });
    }

    async remove(id: string): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = (event: any) => reject(event.target.error);
        });
    }

    async clear(): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(this.STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event: any) => reject(event.target.error);
        });
    }
}
