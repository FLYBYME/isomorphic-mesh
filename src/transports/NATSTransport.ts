import { BaseTransport } from './BaseTransport';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { TransportConnectOptions } from '../types/mesh.types';

export interface INatsConnection {
    closed(): Promise<Error | void>;
    drain(): Promise<void>;
    subscribe(topic: string): { unsubscribe(): void, [Symbol.asyncIterator](): AsyncIterator<any> };
    publish(topic: string, data: Uint8Array): void;
}

export class NATSTransport extends BaseTransport {
    readonly protocol = 'nats';
    private client: INatsConnection | null = null;
    private subs: { unsubscribe(): void }[] = [];

    constructor(serializer: BaseSerializer) {
        super(serializer);
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        const { connect } = eval('require')('nats');
        this.client = await connect({ servers: opts.url }) as INatsConnection;
        this.connected = true;
        this.emit('connected');

        (async () => {
            if (!this.client) return;
            const err = await this.client.closed();
            this.connected = false;
            this.emit('disconnected');
            if (err) this.emit('error', err);
        })();
    }

    async disconnect(): Promise<void> {
        for (const sub of this.subs) sub.unsubscribe();
        this.subs = [];
        if (this.client) {
            await this.client.drain();
            this.client = null;
        }
        this.connected = false;
        this.emit('disconnected');
    }

    async send(nodeID: string, packet: Record<string, unknown>): Promise<void> {
        await this.publish(`mesh.${nodeID}`, packet);
    }

    async subscribe(topic: string): Promise<void> {
        if (!this.client) return;
        const sub = this.client.subscribe(topic);
        this.subs.push(sub);

        (async () => {
            const iterator = sub as unknown as AsyncIterable<{ data: Uint8Array }>;
            for await (const msg of iterator) {
                try {
                    const data = this.serializer.deserialize(msg.data);
                    const handlers = this.subscriptions.get(topic) ?? [];
                    for (const handler of handlers) handler(data);
                    this.emit('packet', { topic, data });
                } catch (err) {
                    this.emit('error', err instanceof Error ? err : new Error(String(err)));
                }
            }
        })();
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        if (!this.client) return;
        const buf = this.serializer.serialize(data);
        this.client.publish(topic, buf);
    }
}
