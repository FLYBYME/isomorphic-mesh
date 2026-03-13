import { BaseTransport } from '../BaseTransport';
import { BaseSerializer } from '../../serializers/BaseSerializer';
import { TransportConnectOptions } from '../../types/mesh.types';

/**
 * HTTPTransport — Node.js implementation using 'express' and 'http'.
 */
export class HTTPTransport extends BaseTransport {
    readonly protocol = 'http';
    private app: any = null;
    private server: any = null;
    private peerAddresses = new Map<string, string>();

    constructor(serializer: BaseSerializer) {
        super(serializer);
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        const express = require('express');
        this.app = express();
        this.app.use(express.raw({ type: '*/*', limit: '10mb' }));

        this.app.post('/rpc/:topic', (req: any, res: any) => {
            const topic = req.params.topic;
            const data = this.serializer.deserialize(req.body);
            const handlers = this.subscriptions.get(topic) || [];
            for (const handler of handlers) handler(data);
            this.emit('packet', { topic, data });
            res.status(200).send('OK');
        });

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(opts.port || 0, () => {
                this.connected = true;
                this.emit('connected');
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    async disconnect(): Promise<void> {
        if (this.server) {
            await new Promise<void>(resolve => this.server.close(() => resolve()));
        }
        this.connected = false;
        this.emit('disconnected');
    }

    async send(nodeID: string, packet: Record<string, unknown>): Promise<void> {
        const address = this.peerAddresses.get(nodeID);
        if (!address) throw new Error(`No address for node ${nodeID}`);

        const buf = this.serializer.serialize(packet);
        const response = await fetch(`${address}/rpc/__direct`, {
            method: 'POST',
            body: buf as BodyInit,
            headers: { 'Content-Type': 'application/octet-stream' },
        });
        if (!response.ok) throw new Error(`HTTP send failed: ${response.status}`);
    }

    async publish(_topic: string, _data: Record<string, unknown>): Promise<void> {
        // SSE not implemented
    }

    async connectToPeer(nodeID: string, address: string): Promise<void> {
        this.peerAddresses.set(nodeID, address);
    }
}
