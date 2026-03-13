// @ts-nocheck
import { TransportManager } from '../src/core/TransportManager';
import { NetworkController } from '../src/core/NetworkController';
import { NetworkDispatcher } from '../src/core/NetworkDispatcher';
import { MeshOrchestrator } from '../src/core/MeshOrchestrator';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis()
} as any;

const mockRegistry = {
    getNode: jest.fn(),
    getNodes: jest.fn().mockReturnValue([]),
    getAvailableNodes: jest.fn().mockReturnValue([]),
    registerNode: jest.fn(),
    unregisterNode: jest.fn(),
    heartbeat: jest.fn()
} as any;

const mockNode = {
    nodeId: 'node-1',
    namespace: 'default',
    logger: mockLogger,
    registry: mockRegistry,
    publish: jest.fn().mockResolvedValue(undefined)
} as any;

describe('Core Classes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('TransportManager works', async () => {
        const tm = new TransportManager({
            transportType: ['ws', 'tcp'],
            serializerType: 'json',
            port: 8080,
            host: 'localhost'
        }, mockNode);

        expect(tm.getTransport()).toBeDefined();
        expect(tm.getTransportByType('ws')).toBeDefined();
        expect(tm.getTransportByType('tcp')).toBeDefined();

        await tm.connect({ url: 'test', port: 1234 });
        await tm.disconnect();

        mockRegistry.getNode.mockReturnValueOnce({ addresses: ['ws://test'] });
        try { await tm.send('node-2', { a: 1 }); } catch(e) {}

        mockRegistry.getNode.mockReturnValueOnce({ addresses: ['tcp://test'] });
        try { await tm.send('node-2', { a: 1 }); } catch(e) {}

        mockRegistry.getNode.mockReturnValueOnce({ addresses: ['nats://test'] });
        try { await tm.send('node-2', { a: 1 }); } catch(e) {}

        mockRegistry.getNode.mockReturnValueOnce({ addresses: ['http://test'] });
        try { await tm.send('node-2', { a: 1 }); } catch(e) {}

        mockRegistry.getNode.mockReturnValueOnce({ addresses: ['invalid://test'] });
        try { await tm.send('node-2', { a: 1 }); } catch(e) {}

        try { await tm.publish('topic', { b: 2 }); } catch(e) {}
        expect(tm.isConnected()).toBe(false);
    });

    it('NetworkController works', async () => {
        const ctrl = new NetworkController(mockNode, mockLogger);
        const dispatcher = new NetworkDispatcher(mockLogger);
        ctrl.registerHandlers(dispatcher);

        await dispatcher.dispatch({ senderNodeID: 'sender', topic: '$node.info', data: { nodeID: 'node-2' }, id: '1', timestamp: 1 });
        expect(mockRegistry.registerNode).toHaveBeenCalled();

        await dispatcher.dispatch({ senderNodeID: 'sender', topic: '$node.heartbeat', data: { nodeID: 'node-2' }, id: '2', timestamp: 2 });
        expect(mockRegistry.heartbeat).toHaveBeenCalled();

        await dispatcher.dispatch({ senderNodeID: 'sender', topic: '$node.disconnect', data: { nodeID: 'node-2' }, id: '3', timestamp: 3 });
        expect(mockRegistry.unregisterNode).toHaveBeenCalled();

        await dispatcher.dispatch({ senderNodeID: 'sender', topic: '$node.ping', data: {}, id: '4', timestamp: 4 });
        expect(mockNode.publish).toHaveBeenCalledWith('$node.pong', expect.any(Object));

        mockNode.orchestrator = { handlePEX: jest.fn().mockResolvedValue(undefined) };
        await dispatcher.dispatch({ senderNodeID: 'sender', topic: '$node.pex', data: {}, id: '5', timestamp: 5 });
        expect(mockNode.orchestrator.handlePEX).toHaveBeenCalled();

        await dispatcher.dispatch({ senderNodeID: 'sender', topic: '$rpc.request', data: { action: 'test' }, id: '6', timestamp: 6 });
        await dispatcher.dispatch({ senderNodeID: 'sender', topic: '$rpc.response', data: {}, id: '7', timestamp: 7 });
    });

    it('NetworkDispatcher works', async () => {
        const disp = new NetworkDispatcher(mockLogger);
        const handler = jest.fn();
        disp.on('test.topic', handler);
        disp.on('test.*', handler);

        await disp.dispatch({ senderNodeID: 'sender', topic: 'test.topic', data: { a: 1 }, id: '1', timestamp: 1 });
        expect(handler).toHaveBeenCalledTimes(1);

        await disp.dispatch({ senderNodeID: 'sender', topic: 'test.other', data: { b: 2 }, id: '2', timestamp: 2 });
        expect(handler).toHaveBeenCalledTimes(2);

        await disp.dispatch({ senderNodeID: 'sender', topic: 'unmatched', data: { c: 3 }, id: '3', timestamp: 3 });
        expect(handler).toHaveBeenCalledTimes(2);

        await disp.dispatch({ senderNodeID: 'sender', topic: '__direct', data: { topic: 'test.topic', data: { d: 4 } }, id: '4', timestamp: 4 });
        expect(handler).toHaveBeenCalledTimes(3);
        
        await disp.dispatch({ senderNodeID: 'sender', topic: '__direct', data: { topic: 'test.topic' }, id: '5', timestamp: 5 });
        expect(handler).toHaveBeenCalledTimes(4);

        // Test rate limit
        for(let i=0; i < 1005; i++) {
            await disp.dispatch({ topic: 'test.topic', senderNodeID: 'rate-limit-node', data: {}, id: `msg-${i}`, timestamp: i });
        }
        
        disp.cleanupRateLimits();
    });

    it('MeshOrchestrator works', async () => {
        jest.useFakeTimers();
        const orch = new MeshOrchestrator(mockNode, { bootstrapNodes: ['ws://test'], gossipIntervalMs: 1000 });
        
        await orch.start();
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Bootstrapping from ws://test'));
        
        mockRegistry.getAvailableNodes.mockReturnValue([{ nodeID: 'node-2' }]);
        mockRegistry.getNodes.mockReturnValue([{ nodeID: 'node-1' }, { nodeID: 'node-2' }, { nodeID: 'node-3' }]);
        
        jest.advanceTimersByTime(1500);
        expect(mockNode.publish).toHaveBeenCalledWith('$node.pex', expect.any(Object));

        await orch.handlePEX({ peers: [{ nodeID: 'node-3' }] });
        expect(mockRegistry.registerNode).toHaveBeenCalledWith(expect.objectContaining({ nodeID: 'node-3' }));

        await orch.stop();
        jest.useRealTimers();
    });
});
