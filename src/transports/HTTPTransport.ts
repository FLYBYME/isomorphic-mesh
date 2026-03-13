import { BaseTransport } from './BaseTransport';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { Env } from '../utils/Env';
import { TransportConnectOptions } from '../types/mesh.types';

export interface IExpress {
    use(path: string, ...handlers: unknown[]): void;
    post(path: string, handler: (req: any, res: any) => void): void;
    listen(port: number, cb: () => void): { close(cb: () => void): void, on(ev: string, cb: (e: Error) => void): void, address(): unknown };
    raw(opts: unknown): unknown;
}

export class HTTPTransport extends BaseTransport {
    readonly protocol = 'http';
    private app: IExpress | null = null;
    private server: { close(cb: () => void): void } | null = null;
    private peerAddresses = new Map<string, string>();

    constructor(serializer: BaseSerializer) {
        super(serializer);
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        if (Env.isBrowser()) {
            this.connected = true;
            this.emit('connected');
            return;
        }

        const express = eval('require')('express');
        this.app = express() as IExpress;
        this.app.use('/', express.raw({ type: '*/*', limit: '10mb' }));

        this.app.post('/rpc/:topic', (req: { params: { topic: string }, body: Uint8Array }, res: { status(code: number): { send(msg: string): void } }) => {
            const topic = req.params.topic;
            const data = this.serializer.deserialize(req.body);
            const handlers = this.subscriptions.get(topic) || [];
            for (const handler of handlers) handler(data);
            this.emit('packet', { topic, data });
            res.status(200).send('OK');
        });

        return new Promise((resolve, reject) => {
            const srv = this.app!.listen(opts.port || 0, () => {
                this.connected = true;
                this.emit('connected');
                resolve();
            });
            srv.on('error', reject);
            this.server = srv;
        });
    }

    async disconnect(): Promise<void> {
        if (this.server) {
            await new Promise<void>(resolve => this.server!.close(() => resolve()));
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

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        // SSE implementation omitted
    }

    async connectToPeer(nodeID: string, address: string): Promise<void> {
        this.peerAddresses.set(nodeID, address);
    }
}
