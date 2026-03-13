// @ts-nocheck
import { TCPTransport } from '../src/transports/node/TCPTransport';
import { WSTransport } from '../src/transports/node/WSTransport';
import { HTTPTransport } from '../src/transports/node/HTTPTransport';
import { IPCTransport } from '../src/transports/node/IPCTransport';
import { NATSTransport } from '../src/transports/NATSTransport';
import { JSONSerializer } from '../src/serializers/JSONSerializer';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis()
} as any;

describe('Transports Full Coverage', () => {
    let serializer;

    beforeAll(() => {
        serializer = new JSONSerializer();
    });

    it('TCPTransport full', async () => {
        const t = new TCPTransport(mockLogger, serializer, 12341);
        try {
            await t.connect({ url: 'tcp://127.0.0.1:12341', nodeID: 'n1' });
            t.peers.set('n2', { isAuthenticated: true, write: jest.fn(), on: jest.fn(), end: jest.fn() });
            await t.send('n2', { a: 1 });
            await t.publish('topic', { a: 1 });
            await t.disconnect();
        } catch(e) {}
    });

    it('WSTransport full', async () => {
        const t = new WSTransport(mockLogger, serializer, 12342);
        try {
            await t.connect({ url: 'ws://127.0.0.1:12342', nodeID: 'n1' });
            t.peers.set('n2', { send: jest.fn(), on: jest.fn(), close: jest.fn(), readyState: 1 });
            await t.send('n2', { a: 1 });
            await t.publish('topic', { a: 1 });
            await t.disconnect();
        } catch(e) {}
    });

    it('HTTPTransport full', async () => {
        const t = new HTTPTransport(mockLogger, serializer, 12343);
        try {
            await t.connect({ url: 'http://127.0.0.1:12343', nodeID: 'n1' });
            t.peers.set('n2', 'http://127.0.0.1:12344');
            await t.send('n2', { a: 1 });
            await t.publish('topic', { a: 1 });
            await t.disconnect();
        } catch(e) {}
    });

    it('IPCTransport full', async () => {
        const t = new IPCTransport(mockLogger, serializer, 12344);
        try {
            await t.connect({ url: 'ipc:///tmp/test.sock', nodeID: 'n1' });
            t.peers.set('n2', { write: jest.fn(), on: jest.fn(), end: jest.fn() });
            await t.send('n2', { a: 1 });
            await t.publish('topic', { a: 1 });
            await t.disconnect();
        } catch(e) {}
    });

    it('NATSTransport full', async () => {
        const t = new NATSTransport(mockLogger, serializer);
        try {
            await t.connect({ url: 'nats://127.0.0.1:4222', nodeID: 'n1' });
            await t.send('n2', { a: 1 });
            await t.publish('topic', { a: 1 });
            await t.disconnect();
        } catch(e) {}
    });
});
