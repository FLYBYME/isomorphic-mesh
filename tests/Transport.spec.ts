import { TransportFactory } from '../src/core/TransportFactory';
import { TransportManager } from '../src/core/TransportManager';
import { BinarySerializer } from '../src/serializers/BinarySerializer';
import { JSONSerializer } from '../src/serializers/JSONSerializer';
import { UnifiedServer } from '../src/core/UnifiedServer';
import { Env } from '../src/utils/Env';
import { MockTransport } from '../src/transports/MockTransport';

describe('Networking & Transports', () => {
    it('Transport Factory Strategy: defaults correctly on Node.js', () => {
        const serializer = new JSONSerializer();
        const transport = TransportFactory.createTransport('ws', serializer, 0);
        expect(transport.protocol).toBe('ws');
    });

    it('Binary Serialization vs JSON: Produces identical or smaller payloads', () => {
        // Since BinarySerializer currently uses JSON.stringify internally, they'll be same size.
        // This test serves as a benchmark for future real binary implementation.
        const bin = new BinarySerializer();
        const json = new JSONSerializer();
        const data = { hello: 'world', nested: { foo: 'bar' } };
        
        const binPayload = bin.serialize(data);
        const jsonPayload = json.serialize(data);
        
        expect(binPayload.length).toBeLessThanOrEqual(jsonPayload.length);
        expect(bin.deserialize(binPayload)).toEqual(data);
    });

    it('Network Dispatcher Routing: Routes packets based on nodeID', async () => {
        const mockTransport = new MockTransport(new JSONSerializer());
        const sendSpy = jest.spyOn(mockTransport, 'send');
        
        const mockNode: any = {
            nodeID: 'local',
            registry: {
                getNode: (id: string) => ({ nodeID: id, addresses: [`${id}://test`] })
            },
            logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn() }
        };

        const manager = new TransportManager({
            transportType: 'mock' as any,
            serializerType: 'json',
            port: 0,
            host: 'localhost'
        }, mockNode);

        // Inject the actual instance we are spying on
        (manager as any).transports.set('mock', mockTransport);
        (manager as any).primaryTransport = mockTransport;

        await manager.send('remote-1', { topic: 'test' } as any);
        expect(sendSpy).toHaveBeenCalledWith('remote-1', expect.anything());
    });

    it('Unified Server Lifecycle: Binds HTTP and WS listeners', async () => {
        if (!Env.isNode()) return; // Skip in browser

        const server = new UnifiedServer(0);
        const port = await server.listen();
        expect(port).toBeGreaterThan(0);
        
        expect(server.getServer()).not.toBeNull();
        expect(server.getApp()).not.toBeNull();
        
        await server.stop();
    });

    it('Isomorphic Env Detection: identifies Node.js correctly', () => {
        // Since we are running in Jest (Node.js), isNode should be true
        expect(Env.isNode()).toBe(true);
        expect(Env.isBrowser()).toBe(false);
    });

    it('Transport Manager Cleanup: destroys handles on stop', async () => {
        const mockTransport = { disconnect: jest.fn(), isConnected: () => true };
        const mockNode: any = { nodeID: 'test', logger: { info: jest.fn() } };
        
        const manager = new TransportManager({ transportType: [], serializerType: 'json', port: 0, host: '' }, mockNode);
        (manager as any).transports.set('mock', mockTransport);

        await manager.disconnect();
        expect(mockTransport.disconnect).toHaveBeenCalled();
    });
});
