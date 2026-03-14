import { MeshNetwork } from '../src/core/MeshNetwork';
import { ILogger, IServiceRegistry } from '../src/types/mesh.types';

describe('MeshNetwork Smoke Test', () => {
    let logger: ILogger;
    let registry: IServiceRegistry;

    beforeEach(() => {
        logger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            child: jest.fn().mockReturnThis()
        };
        registry = {
            getNode: jest.fn(),
            getNodes: jest.fn().mockReturnValue([]),
            getAvailableNodes: jest.fn().mockReturnValue([]),
            registerNode: jest.fn(),
            unregisterNode: jest.fn(),
            heartbeat: jest.fn()
        };
    });

    test('should initialize and start/stop without crashing', async () => {
        const mesh = new MeshNetwork({
            transportType: 'ws',
            serializerType: 'json',
            port: 0,
            host: '127.0.0.1'
        }, logger, registry);

        await mesh.start();
        expect(mesh.transport.isConnected()).toBe(true);
        await mesh.stop();
        expect(mesh.transport.isConnected()).toBe(false);
    });

    test('should handle messages', (done) => {
        const mesh = new MeshNetwork({
            transportType: 'ws',
            serializerType: 'json',
            port: 0,
            host: '127.0.0.1'
        }, logger, registry);

        mesh.onMessage('test-topic', (data: any) => {
            expect(data.hello).toBe('world');
            mesh.stop().then(() => done());
        });

        mesh.start().then(() => {
            // Manually simulate an incoming packet
            mesh.transport.emit('packet', { 
                topic: 'test-topic', 
                data: { hello: 'world' },
                id: 'test-id',
                type: 'EVENT',
                senderNodeID: 'remote-node',
                timestamp: Date.now()
            });
        });
    });
});
