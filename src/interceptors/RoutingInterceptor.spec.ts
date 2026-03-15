import { RoutingInterceptor } from './RoutingInterceptor';
import { IMeshPacket } from 'isomorphic-core';
import { TransportManager } from '../core/TransportManager';

describe('RoutingInterceptor', () => {
    let interceptor: RoutingInterceptor;
    let transport: any;
    const nodeID = 'gateway-node';

    beforeEach(() => {
        transport = {
            send: jest.fn().mockResolvedValue(undefined)
        };
        interceptor = new RoutingInterceptor(nodeID, transport as any as TransportManager);
    });

    it('should pass through packets for this node', async () => {
        const packet: IMeshPacket = {
            id: '1',
            topic: 'test',
            type: 'EVENT',
            senderNodeID: 'sender',
            timestamp: Date.now(),
            meta: { finalDestinationID: nodeID }
        };
        const result = await interceptor.onInbound(packet);
        expect(result).toBe(packet);
        expect(transport.send).not.toHaveBeenCalled();
    });

    it('should forward packets for other nodes', async () => {
        const packet: IMeshPacket = {
            id: '1',
            topic: 'test',
            type: 'EVENT',
            senderNodeID: 'sender',
            timestamp: Date.now(),
            meta: { finalDestinationID: 'worker-node', ttl: 5 }
        };
        const result = await interceptor.onInbound(packet);
        
        expect(result.topic).toBe('__forwarded');
        expect(transport.send).toHaveBeenCalledWith('worker-node', expect.objectContaining({
            id: '1',
            meta: expect.objectContaining({
                ttl: 4,
                path: [nodeID],
                finalDestinationID: 'worker-node'
            })
        }));
    });

    it('should drop packets with expired TTL', async () => {
        const packet: IMeshPacket = {
            id: '1',
            topic: 'test',
            type: 'EVENT',
            senderNodeID: 'sender',
            timestamp: Date.now(),
            meta: { finalDestinationID: 'worker-node', ttl: 1 }
        };
        
        // Mock console.error to avoid noise in tests
        const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        const result = await interceptor.onInbound(packet);
        
        expect(result.topic).toBe('__dropped');
        expect(transport.send).not.toHaveBeenCalled();
        expect(spy).toHaveBeenCalled();
        
        spy.mockRestore();
    });

    it('should initialize routing meta on outbound packets', async () => {
        const packet: IMeshPacket = {
            id: '1',
            topic: 'test',
            type: 'EVENT',
            senderNodeID: nodeID,
            timestamp: Date.now(),
            meta: { finalDestinationID: 'worker-node' }
        };
        const result = await interceptor.onOutbound(packet);
        expect(result.meta?.ttl).toBe(5);
        expect(result.meta?.path).toEqual([]);
    });
});
