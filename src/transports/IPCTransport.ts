import { BaseTransport } from './BaseTransport';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { Env } from '../utils/Env';
import { TransportConnectOptions } from '../types/mesh.types';

export interface IWorkerLike {
    on(event: string, cb: (data: unknown) => void): void;
    postMessage(data: unknown): void;
    terminate?(): void;
}

export class IPCTransport extends BaseTransport {
    readonly protocol = 'ipc';
    private workers = new Map<string, IWorkerLike>();
    private isWorker = false;

    constructor(serializer: BaseSerializer) {
        super(serializer);
        if (Env.isNode()) {
            const { isMainThread } = eval('require')('node:worker_threads');
            this.isWorker = !isMainThread;
        }
    }

    async connect(opts: TransportConnectOptions): Promise<void> {
        if (!Env.isNode()) {
            this.connected = true;
            this.emit('connected');
            return;
        }

        const { parentPort } = eval('require')('node:worker_threads');
        if (this.isWorker && parentPort) {
            parentPort.on('message', (raw: unknown) => this.handleIncoming(raw));
        }

        this.connected = true;
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.workers.clear();
        if (Env.isNode()) {
            const { parentPort } = eval('require')('node:worker_threads');
            if (this.isWorker && parentPort) {
                parentPort.removeAllListeners('message');
            }
        }
        this.connected = false;
        this.emit('disconnected');
    }

    registerWorker(nodeID: string, worker: IWorkerLike): void {
        this.workers.set(nodeID, worker);
        worker.on('message', (raw: unknown) => {
            if (raw && typeof raw === 'object' && 'topic' in (raw as object)) {
                this.handleIncoming(raw);
            }
        });
    }

    async send(nodeID: string, packet: Record<string, unknown>): Promise<void> {
        const envelope = { topic: '__direct', data: packet, senderNodeID: this.nodeID };
        const target = this.workers.get(nodeID);
        if (target) {
            target.postMessage(envelope);
            return;
        }

        if (Env.isNode()) {
            const { parentPort } = eval('require')('node:worker_threads');
            if (this.isWorker && parentPort) {
                parentPort.postMessage(envelope);
            }
        }
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        const envelope = { topic, data, senderNodeID: this.nodeID };
        if (Env.isNode()) {
            const { parentPort } = eval('require')('node:worker_threads');
            if (this.isWorker && parentPort) {
                parentPort.postMessage(envelope);
            } else {
                for (const worker of this.workers.values()) {
                    worker.postMessage(envelope);
                }
            }
        }
        const handlers = this.subscriptions.get(topic) || [];
        for (const handler of handlers) handler(data);
    }

    private handleIncoming(raw: unknown): void {
        if (!raw || typeof raw !== 'object') return;
        const { topic, data } = raw as { topic: string, data: Record<string, unknown> };
        const handlers = this.subscriptions.get(topic) || [];
        for (const handler of handlers) handler(data);
        this.emit('packet', raw);
    }

    hasWorker(nodeID: string): boolean {
        return this.workers.has(nodeID);
    }
}
