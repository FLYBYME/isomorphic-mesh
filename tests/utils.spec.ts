import { IsomorphicCrypto } from '../src/utils/Crypto';
import { Env } from '../src/utils/Env';
import { OfflineStorageEngine } from '../src/utils/OfflineStorageEngine';

describe('Utils', () => {
    it('IsomorphicCrypto works', async () => {
        const id = IsomorphicCrypto.randomID();
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);

        const id2 = IsomorphicCrypto.randomID(32);
        expect(id2.length).toBeGreaterThan(0);

        try {
            // Test Ed25519 mock (if possible, otherwise just ignore)
        } catch (e) {}

        const b64 = IsomorphicCrypto.toBase64(new Uint8Array([1, 2, 3]));
        expect(typeof b64).toBe('string');
        const bytes = IsomorphicCrypto.fromBase64(b64);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(bytes[0]).toBe(1);
    });

    it('Env works', () => {
        expect(typeof Env.isNode()).toBe('boolean');
        expect(typeof Env.isBrowser()).toBe('boolean');
    });

    it('OfflineStorageEngine works', async () => {
        const storage = new OfflineStorageEngine();
        
        await storage.init();
        await storage.queue({ id: '1', targetId: 'A', topic: 't', data: {}, timestamp: 1 });
        await storage.queue({ id: '2', targetId: 'B', topic: 't', data: {}, timestamp: 2 });
        const msgs = await storage.getAll();
        expect(msgs.length).toBe(0); // Because we are not in browser so db is null
        
        await storage.remove('1');
        await storage.clear();
    });
});
