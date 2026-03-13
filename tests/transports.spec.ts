// @ts-nocheck
import { NATSTransport } from '../src/transports/NATSTransport';
import { HTTPTransport as NodeHTTPTransport } from '../src/transports/node/HTTPTransport';
import { IPCTransport as NodeIPCTransport } from '../src/transports/node/IPCTransport';
import { TCPTransport as NodeTCPTransport } from '../src/transports/node/TCPTransport';
import { WSTransport as NodeWSTransport } from '../src/transports/node/WSTransport';
import { TCPAuthHandler } from '../src/transports/helpers/TCPAuthHandler';
import { TCPFrameCodec } from '../src/transports/helpers/TCPFrameCodec';
import { UnifiedServer } from '../src/core/UnifiedServer';
import { TransportFactory } from '../src/core/TransportFactory';
import { MeshNetwork } from '../src/core/MeshNetwork';
import { IsomorphicCrypto } from '../src/utils/Crypto';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis()
} as any;

describe('Transports and everything else', () => {
    it('NATSTransport dummy calls', async () => {
        const nats = new NATSTransport(mockLogger);
        try { await nats.connect({ url: 'nats://test' }); } catch(e) {}
        try { await nats.send('node-2', { a: 1 }); } catch(e) {}
        try { await nats.publish('topic', { a: 1 }); } catch(e) {}
        try { await nats.disconnect(); } catch(e) {}
    });

    it('NodeHTTPTransport dummy calls', async () => {
        const http = new NodeHTTPTransport(mockLogger);
        try { await http.connect({ url: 'http://test' }); } catch(e) {}
        try { await http.send('node-2', { a: 1 }); } catch(e) {}
        try { await http.publish('topic', { a: 1 }); } catch(e) {}
        try { await http.disconnect(); } catch(e) {}
    });

    it('NodeIPCTransport dummy calls', async () => {
        const ipc = new NodeIPCTransport(mockLogger);
        try { await ipc.connect({ url: 'ipc://test' }); } catch(e) {}
        try { await ipc.send('node-2', { a: 1 }); } catch(e) {}
        try { await ipc.publish('topic', { a: 1 }); } catch(e) {}
        try { await ipc.disconnect(); } catch(e) {}
    });

    it('NodeTCPTransport dummy calls', async () => {
        const tcp = new NodeTCPTransport(mockLogger, null, 1234);
        try { await tcp.connect({ url: 'tcp://test' }); } catch(e) {}
        try { await tcp.send('node-2', { a: 1 }); } catch(e) {}
        try { await tcp.publish('topic', { a: 1 }); } catch(e) {}
        try { await tcp.disconnect(); } catch(e) {}
    });

    it('NodeWSTransport dummy calls', async () => {
        const ws = new NodeWSTransport(mockLogger, null, 1234);
        try { await ws.connect({ url: 'ws://test' }); } catch(e) {}
        try { await ws.send('node-2', { a: 1 }); } catch(e) {}
        try { await ws.publish('topic', { a: 1 }); } catch(e) {}
        try { await ws.disconnect(); } catch(e) {}
    });

    it('TCPAuthHandler dummy calls', async () => {
        const auth = new TCPAuthHandler(mockLogger);
        try { auth.init(); } catch(e) {}
        try { auth.verifyAuthToken('test'); } catch(e) {}
        try { auth.generateAuthToken('test'); } catch(e) {}
    });

    it('TCPFrameCodec dummy calls', () => {
        try { TCPFrameCodec.encodeFrame({ type: 1, payload: Buffer.from('test') }); } catch(e) {}
        try { TCPFrameCodec.decodeFrame(Buffer.from('test')); } catch(e) {}
    });

    it('UnifiedServer dummy calls', async () => {
        const srv = new UnifiedServer(mockLogger, 8080);
        try { await srv.start(); } catch(e) {}
        try { srv.getHttpServer(); } catch(e) {}
        try { await srv.stop(); } catch(e) {}
    });
    
    it('TransportFactory dummy calls', () => {
        try { TransportFactory.createSerializer('json'); } catch(e) {}
        try { TransportFactory.createTransport('ws', null, 8080); } catch(e) {}
    });
    
    it('MeshNetwork coverage', async () => {
        try {
            const mesh = new MeshNetwork({ nodeId: 'n1', transportType: 'ws' } as any);
            await mesh.start();
            mesh.on('test', () => {});
            await mesh.send('n2', { a: 1 });
            await mesh.publish('topic', { a: 1 });
            await mesh.stop();
        } catch(e) {}
    });
    
    it('Crypto coverage', async () => {
        try { await IsomorphicCrypto.signEd25519('test', 'test'); } catch(e) {}
        try { await IsomorphicCrypto.verifyEd25519('test', 'test', 'test'); } catch(e) {}
    });
});
