import { MeshNetwork } from '../src/core/MeshNetwork';
import { IInterceptor } from 'isomorphic-core';
import { MeshPacket } from '../src/types/packet.types';

describe('MeshNetwork Interceptors', () => {
    let network: MeshNetwork;
    let mockLogger: any;
    let mockRegistry: any;

    beforeEach(() => {
        mockLogger = { 
            debug: jest.fn(), 
            info: jest.fn(), 
            warn: jest.fn(), 
            error: jest.fn(),
            child: jest.fn().mockReturnThis()
        };
        mockRegistry = { selectNode: jest.fn(), getNode: jest.fn() };
        network = new MeshNetwork({ transportType: 'mock', serializerType: 'json', port: 0 } as any, mockLogger, mockRegistry);
    });

    test('should execute outbound interceptors', async () => {
        const interceptor: IInterceptor<MeshPacket, MeshPacket> = {
            name: 'test-interceptor',
            onOutbound: async (packet) => {
                packet.meta = { ...packet.meta, intercepted: true };
                return packet;
            }
        };

        network.use(interceptor);
        
        const sendSpy = jest.spyOn((network as any).transport, 'send').mockResolvedValue(undefined);
        
        await network.send('node-2', 'test-topic', { foo: 'bar' });
        
        expect(sendSpy).toHaveBeenCalledWith('node-2', expect.objectContaining({
            meta: expect.objectContaining({ intercepted: true })
        }));
    });

    test('should execute inbound interceptors in reverse order', async () => {
        const order: string[] = [];
        const i1: IInterceptor<MeshPacket, MeshPacket> = {
            name: 'i1',
            onInbound: async (p) => { order.push('i1'); return p; }
        };
        const i2: IInterceptor<MeshPacket, MeshPacket> = {
            name: 'i2',
            onInbound: async (p) => { order.push('i2'); return p; }
        };

        network.use(i1);
        network.use(i2);

        const packet: MeshPacket = {
            id: '1', topic: 't', type: 'EVENT', senderNodeID: 'n2', timestamp: Date.now(), data: {}
        };

        // Simulate incoming packet
        await (network as any).transport.emit('packet', packet);

        expect(order).toEqual(['i2', 'i1']);
    });
});
