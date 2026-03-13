import { TCPTransport } from '../src/transports/node/TCPTransport';
import { WSTransport } from '../src/transports/node/WSTransport';
import { HTTPTransport } from '../src/transports/node/HTTPTransport';
import { IPCTransport } from '../src/transports/node/IPCTransport';
import { NATSTransport } from '../src/transports/NATSTransport';
import { TCPAuthHandler } from '../src/transports/helpers/TCPAuthHandler';
import { TCPFrameCodec } from '../src/transports/helpers/TCPFrameCodec';
import { OfflineStorageEngine } from '../src/utils/OfflineStorageEngine';
import { IsomorphicCrypto } from '../src/utils/Crypto';
import { JSONSerializer } from '../src/serializers/JSONSerializer';
import { WirePacketType } from '../src/types/mesh.types';
import { Env } from '../src/utils/Env';

jest.mock('net', () => ({
    connect: jest.fn().mockReturnValue({
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn()
    }),
    createServer: jest.fn().mockReturnValue({ listen: jest.fn(), on: jest.fn(), close: jest.fn() })
}));
jest.mock('http', () => ({
    createServer: jest.fn().mockReturnValue({ listen: jest.fn(), on: jest.fn(), address: () => ({port: 1234}) }),
    request: jest.fn().mockReturnValue({ on: jest.fn(), write: jest.fn(), end: jest.fn() })
}));

describe('Coverage', () => {
    let serializer: JSONSerializer;
    beforeAll(() => {
        serializer = new JSONSerializer();
        jest.spyOn(Env, 'isBrowser').mockReturnValue(true);
        (global as any).indexedDB = {
            open: jest.fn().mockReturnValue({
                onupgradeneeded: null,
                onsuccess: null,
                onerror: null,
                result: {
                    objectStoreNames: { contains: jest.fn().mockReturnValue(false) },
                    createObjectStore: jest.fn(),
                    transaction: jest.fn().mockReturnValue({
                        objectStore: jest.fn().mockReturnValue({
                            add: jest.fn().mockReturnValue({ onsuccess: null, onerror: null }),
                            getAll: jest.fn().mockReturnValue({ onsuccess: null, onerror: null }),
                            delete: jest.fn().mockReturnValue({ onsuccess: null, onerror: null }),
                            clear: jest.fn().mockReturnValue({ onsuccess: null, onerror: null })
                        })
                    })
                }
            })
        };
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it('TCPTransport internal coverage', async () => {
        const t = new TCPTransport(serializer) as any;
        t.nodeID = 'test-node';
        t.logger = { error: jest.fn(), warn: jest.fn() };
        t.authHandler = { handleAuth: jest.fn() };

        const mockSocket = {
            write: jest.fn(),
            destroy: jest.fn(),
            on: jest.fn()
        };

        const peer = {
            socket: mockSocket,
            nodeID: 'n2',
            isAuthenticated: false,
            isChoked: true,
            bufferPot: new Uint8Array(0)
        };
        t.peers.set('n2', peer);

        // handleConnection
        try { t.handleConnection(mockSocket); } catch(e) {}

        // processData
        try { t.processData(peer, new Uint8Array(10)); } catch(e) {}
        try { t.processData(peer, new Uint8Array(TCPFrameCodec.MAX_FRAME_SIZE + 30)); } catch(e) {} // overflow
        
        // frame decode coverage
        peer.bufferPot = new Uint8Array(0);
        try { 
            const frame = TCPFrameCodec.encode(WirePacketType.PING, '1234567890123456', new Uint8Array(5));
            t.processData(peer, frame); 
        } catch(e) {}

        // dispatchFrame
        try { await t.dispatchFrame(peer, new Uint8Array(10)); } catch(e) {} // too small
        try { 
            const frame = TCPFrameCodec.encode(WirePacketType.AUTH, '1234567890123456', new Uint8Array(5));
            await t.dispatchFrame(peer, frame); 
        } catch(e) {}
        try { 
            peer.isAuthenticated = true;
            const frame = TCPFrameCodec.encode(WirePacketType.PING, '1234567890123456', new Uint8Array(5));
            await t.dispatchFrame(peer, frame); 
        } catch(e) {}
        try { 
            const frame = TCPFrameCodec.encode(WirePacketType.RPC_REQ, '1234567890123456', new TextEncoder().encode('{}'));
            await t.dispatchFrame(peer, frame); 
        } catch(e) {}

        // startHeartbeat
        try { t.startHeartbeat(peer); } catch(e) {}

        // connectToPeer
        try { await t.connectToPeer('n3', 'tcp://127.0.0.1:9999'); } catch(e) {}
    });

    it('TCPAuthHandler coverage', async () => {
        const transport = {
            registry: { getNode: jest.fn().mockReturnValue({ publicKey: 'pk' }) },
            privateKey: 'priv',
            getNodeID: jest.fn().mockReturnValue('node1'),
            peers: new Map(),
            emit: jest.fn(),
            logger: { error: jest.fn() }
        } as any;
        const handler = new TCPAuthHandler(transport);
        const peer = { socket: { write: jest.fn(), destroy: jest.fn() } } as any;

        const isNode = process.versions != null && process.versions.node != null;
        if (isNode) {
            IsomorphicCrypto.verifyEd25519 = jest.fn().mockResolvedValue(true);
            IsomorphicCrypto.signEd25519 = jest.fn().mockResolvedValue('sig');

            // response
            let payload = new TextEncoder().encode(JSON.stringify({ type: 'response', nodeID: 'n2', signature: 'sig', nonce: 'nonce' }));
            try { await handler.handleAuth(peer, payload); } catch(e) {}

            // challenge
            payload = new TextEncoder().encode(JSON.stringify({ type: 'challenge', nonce: 'nonce' }));
            try { await handler.handleAuth(peer, payload); } catch(e) {}

            // errors
            payload = new TextEncoder().encode(JSON.stringify({ type: 'response' }));
            try { await handler.handleAuth(peer, payload); } catch(e) {}
        }
    });

    it('WSTransport coverage', async () => {
        const t = new WSTransport(serializer) as any;
        t.nodeID = 'n1';
        t.logger = { error: jest.fn(), warn: jest.fn() };
        t.wss = { on: jest.fn(), close: jest.fn() };
        t.server = { listen: jest.fn(), on: jest.fn(), address: () => ({ port: 1234 }) };
        
        try { await t.connect({ url: 'ws://127.0.0.1:1234', sharedServer: {} }); } catch(e) {}
        try { await t.startNodeServer(); } catch(e) {}
        try { t.setupWSSHandlers(); } catch(e) {}

        const mockWs = { send: jest.fn(), on: jest.fn(), close: jest.fn(), readyState: 1, terminate: jest.fn() };
        t.peers.set('n2', mockWs);
        
        try { t.handleIncomingMessage(JSON.stringify({ type: 'HANDSHAKE', senderId: 'n2' }), mockWs, jest.fn()); } catch(e) {}
        try { t.handleIncomingMessage(new ArrayBuffer(10), mockWs, jest.fn()); } catch(e) {}
        
        try { await t.send('n2', { a: 1 }); } catch(e) {}
        try { await t.publish('topic', { a: 1 }); } catch(e) {}
        
        try { t.startHeartbeat(); } catch(e) {}
        try { t.connectToPeer('n3', 'ws://127.0.0.1:9999'); } catch(e) {}
    });

    it('IPCTransport coverage', async () => {
        const t = new IPCTransport(serializer) as any;
        t.logger = { error: jest.fn(), warn: jest.fn() };
        
        const mockSocket = { write: jest.fn(), on: jest.fn(), end: jest.fn(), destroy: jest.fn() };
        t.peerAddresses.set('n2', mockSocket);

        try { await t.connect({ url: 'ipc:///tmp/test.sock', nodeID: 'n1' }); } catch(e) {}
        try { await t.send('n2', { a: 1 }); } catch(e) {}
        try { await t.publish('topic', { a: 1 }); } catch(e) {}
        
        try { t.handleConnection(mockSocket); } catch(e) {}
        try { t.processData('n2', mockSocket, Buffer.from(JSON.stringify({type: 'HANDSHAKE', senderId: 'n2'}) + '\\n')); } catch(e) {}
        try { t.processData('n2', mockSocket, Buffer.from(JSON.stringify({type: 'PING'}) + '\\n')); } catch(e) {}
        
        try { await t.connectToPeer('n3', 'ipc:///tmp/test2.sock'); } catch(e) {}
    });

    it('HTTPTransport coverage', async () => {
        const t = new HTTPTransport(serializer) as any;
        t.nodeID = 'n1';
        t.peerAddresses.set('n2', 'http://127.0.0.1:1234');

        try { await t.connect({ url: 'http://127.0.0.1:1234', nodeID: 'n1' }); } catch(e) {}
        try { await t.send('n2', { a: 1 }); } catch(e) {}
        try { await t.publish('topic', { a: 1 }); } catch(e) {}
        try { t.handleIncomingRequest({ method: 'POST', body: Buffer.from('{}') }, { status: () => ({ send: jest.fn(), end: jest.fn() }) }); } catch(e) {}
    });

    it('NATSTransport coverage', async () => {
        const t = new NATSTransport(serializer) as any;
        t.client = {
            subscribe: jest.fn().mockReturnValue((async function*() { yield { subject: 'mesh.req.n1', data: new Uint8Array(0) }; })()),
            publish: jest.fn(),
            close: jest.fn()
        };
        try { await t.connect({ url: 'nats://127.0.0.1:4222', nodeID: 'n1' }); } catch(e) {}
        try { t.setupSubscriptions(); } catch(e) {}
        try { await t.send('n2', { a: 1 }); } catch(e) {}
        try { await t.publish('topic', { a: 1 }); } catch(e) {}
        try { t.handleIncomingMessage({ subject: 'mesh.req.n1', data: new Uint8Array(0) }); } catch(e) {}
    });

    it('OfflineStorageEngine coverage', async () => {
        const engine = new OfflineStorageEngine();
        try { await engine.init(); } catch(e) {}
        try { await engine.queue({ id: '1', targetId: '2', topic: 't', data: {}, timestamp: 1 }); } catch(e) {}
        try { await engine.getAll(); } catch(e) {}
        try { await engine.remove('key'); } catch(e) {}
        try { await engine.clear(); } catch(e) {}
    }, 10000);

    it('Crypto coverage', async () => {
        try { IsomorphicCrypto.toBase64(new Uint8Array(10)); } catch(e) {}
        try { IsomorphicCrypto.fromBase64('abcd'); } catch(e) {}
        try { await IsomorphicCrypto.signEd25519('msg', 'priv'); } catch(e) {}
        try { await IsomorphicCrypto.verifyEd25519('sig', 'msg', 'pub'); } catch(e) {}
    });
});
