import { CompressionInterceptor } from '../src/interceptors/CompressionInterceptor';
import { RateLimitInterceptor } from '../src/interceptors/RateLimitInterceptor';
import { CircuitBreakerInterceptor } from '../src/interceptors/CircuitBreakerInterceptor';
import { TraceInterceptor } from '../src/interceptors/TraceInterceptor';
import { WorkerProxyInterceptor } from '../src/interceptors/WorkerProxyInterceptor';
import { IMeshPacket } from '../src/contracts/packet.schema';

describe('Mesh Interceptors', () => {
    it('Compression Interceptor: reduces payload size for large strings', async () => {
        const interceptor = new CompressionInterceptor();
        const largeData = 'A'.repeat(2000);
        const packet: any = { 
            topic: 'test', 
            data: { val: largeData }, 
            senderNodeID: 'node-1', 
            type: 'EVENT', 
            id: '1',
            timestamp: Date.now()
        };

        const outbound = await interceptor.onOutbound(packet);
        expect(outbound.meta?.compression).toBe('gzip');
        expect(typeof outbound.data).toBe('string');
        expect((outbound.data as string).length).toBeLessThan(largeData.length);

        const inbound = await interceptor.onInbound(outbound);
        expect((inbound.data as any).val).toBe(largeData);
    });

    it('Rate Limiting (Global & Per-Peer): blocks requests exceeding threshold and isolates peers', async () => {
        const interceptor = new RateLimitInterceptor();
        const packet1: any = { topic: 'test', senderNodeID: 'peer-1', meta: { tenant_id: 't1' }, timestamp: Date.now(), id: '1', type: 'EVENT' };
        const packet2: any = { topic: 'test', senderNodeID: 'peer-2', meta: { tenant_id: 't1' }, timestamp: Date.now(), id: '2', type: 'EVENT' };

        // peer-1 exceeds limit
        for (let i = 0; i < 1000; i++) {
            await interceptor.onInbound(packet1);
        }
        const blocked = await interceptor.onInbound(packet1);
        expect(blocked.topic).toBe('__dropped');

        const ok = await interceptor.onInbound(packet2);
        expect(ok.topic).toBe('test');
    });

    it('Circuit Breaker Opening & Recovery: opens after threshold and transitions back', async () => {
        const interceptor = new CircuitBreakerInterceptor();
        const packet: any = { topic: 'test', meta: { targetNodeID: 'failing-node' }, senderNodeID: 'me', timestamp: Date.now(), id: '1', type: 'EVENT' };

        // Record 5 failures
        for (let i = 0; i < 5; i++) {
            interceptor.recordFailure('failing-node');
        }

        const blocked = await interceptor.onOutbound(packet);
        expect(blocked.topic).toBe('__circuit_open');

        // Fast-forward time for recovery (HALF_OPEN after 30s)
        const now = Date.now();
        jest.spyOn(Date, 'now').mockReturnValue(now + 31000);

        const halfOpen = await interceptor.onOutbound(packet);
        expect(halfOpen.topic).toBe('test'); // HALF_OPEN allows a trial

        // Success closes it
        interceptor.recordSuccess('failing-node');
        const closed = await interceptor.onOutbound(packet);
        expect(closed.topic).toBe('test');
        
        jest.restoreAllMocks();
    });

    it('Trace Propagation: attaches traceId and spanId to TransportEnvelope headers', async () => {
        const interceptor = new TraceInterceptor();
        const packet: any = { topic: 'test', meta: { traceId: 't123', spanId: 's456' } };

        const outbound = await interceptor.onOutbound(packet);
        expect(outbound.meta.traceId).toBe('t123');
        expect(outbound.meta.spanId).toBe('s456');

        const inbound = await interceptor.onInbound(outbound);
        expect(inbound.meta.traceId).toBe('t123');
    });

    it('Worker Thread Proxy: correctly flags RPCs for worker nodes', async () => {
        const mockRegistry: any = {
            getAvailableNodes: () => [
                { nodeID: 'worker-1', parentID: 'main', nodeType: 'worker', services: [{ name: 'HeavyService', actions: { compute: {} } }] }
            ]
        };
        const interceptor = new WorkerProxyInterceptor('main', mockRegistry, (topic) => false);
        const packet: any = { topic: 'HeavyService.compute', type: 'REQUEST', senderNodeID: 'me', id: '1', timestamp: Date.now() };

        const proxied = await interceptor.onInbound(packet);
        expect(proxied.meta?.finalDestinationID).toBe('worker-1');
        expect(proxied.meta?.isProxy).toBe(true);
    });
});
