import { OfflineStorageEngine } from '../src/utils/OfflineStorageEngine';
import { Env } from '../src/utils/Env';

describe('Offline Storage', () => {
    it('Offline Queueing (Browser): initializes only in browser', async () => {
        const storage = new OfflineStorageEngine();
        
        // In Node.js environment (Jest), init should do nothing
        await storage.init();
        const rpcs = await storage.getAll();
        expect(rpcs).toEqual([]);
    });

    it('Environment Check: Env correctly identifies current context', () => {
        // We know we are in Node.js
        expect(Env.isNode()).toBe(true);
        expect(Env.isBrowser()).toBe(false);
    });
});
