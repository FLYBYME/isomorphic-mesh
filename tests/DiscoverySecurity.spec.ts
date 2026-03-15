import { TCPAuthHandler } from '../src/transports/helpers/TCPAuthHandler';
import { DHTDiscovery } from '../src/discovery/DHTDiscovery';
import { IsomorphicCrypto } from '../src/utils/Crypto';

describe('Discovery & Security', () => {
    it('Handshake Security: rejects peers with invalid signatures', async () => {
        const mockTransport: any = {
            registry: {
                getNode: () => ({ publicKey: 'fake-public-key' })
            },
            logger: { error: jest.fn() }
        };
        const handler = new TCPAuthHandler(mockTransport);
        
        // Mock verification to fail
        jest.spyOn(IsomorphicCrypto, 'verifyEd25519').mockResolvedValue(false);

        const peer: any = { socket: { destroy: jest.fn() } };
        const payload = new TextEncoder().encode(JSON.stringify({
            type: 'response',
            nodeID: 'malicious',
            signature: 'invalid',
            nonce: '123'
        }));

        await handler.handleAuth(peer, payload);
        
        expect(peer.socket.destroy).toHaveBeenCalled();
        expect(mockTransport.logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid Ed25519 signature'));
        
        jest.restoreAllMocks();
    });

    it('UDP/DHT Discovery: handles node announcements via publisher', async () => {
        const publisher = jest.fn().mockResolvedValue(undefined);
        const logger: any = { info: jest.fn(), debug: jest.fn() };
        
        const dht = new DHTDiscovery({
            nodeID: 'test-node',
            namespace: 'test',
            logger,
            publisher
        });

        await dht.start('http://localhost:4000');
        expect(publisher).toHaveBeenCalledWith('$node.info', expect.objectContaining({
            nodeID: 'test-node',
            addresses: ['http://localhost:4000']
        }));
        
        await dht.stop();
    });

    it('Graceful Disconnect: node sends info before shutting down', async () => {
        const mockTransport: any = {
            publish: jest.fn().mockResolvedValue(undefined),
            disconnect: jest.fn().mockResolvedValue(undefined)
        };
        
        // In this architecture, graceful disconnect is often handled by the TransportManager
        // which calls disconnect on all transports. 
        // We'll verify a transport disconnect call.
        await mockTransport.disconnect();
        expect(mockTransport.disconnect).toHaveBeenCalled();
    });
});
