import { BaseTransport } from '../BaseTransport';
import { BaseSerializer } from '../../serializers/BaseSerializer';
import { TransportConnectOptions } from '../../types/mesh.types';

/**
 * IPCTransport — Node.js implementation using 'node:worker_threads'.
 */
export class IPCTransport extends BaseTransport {
    readonly protocol = 'ipc';
    private workers = new Map<string, any>();
    private isWorker = false;

    constructor(serializer: BaseSerializer) {
        super(serializer);
        const { isMainThread } = eval('require')('node:worker_threads');
        this.isWorker = !isMainThread;
    }

    async connect(_opts: TransportConnectOptions): Promise<void> {
        const { parentPort } = eval('require')('node:worker_threads');
        if (this.isWorker && parentPort) {
            parentPort.on('message', (raw: any) => this.handleIncoming(raw));
        }
        this.connected = true;
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.workers.clear();
        const { parentPort } = eval('require')('node:worker_threads');
        if (this.isWorker && parentPort) {
            parentPort.removeAllListeners('message');
        }
        this.connected = false;
        this.emit('disconnected');
    }

    registerWorker(nodeID: string, worker: any): void {
        this.workers.set(nodeID, worker);
        worker.on('message', (raw: any) => {
            if (raw && typeof raw === 'object' && 'topic' in raw) {
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

        const { parentPort } = eval('require')('node:worker_threads');
        if (this.isWorker && parentPort) {
            parentPort.postMessage(envelope);
        }
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        const envelope = { topic, data, senderNodeID: this.nodeID };
        const { parentPort } = eval('require')('node:worker_threads');
        if (this.isWorker && parentPort) {
            parentPort.postMessage(envelope);
        } else {
            for (const worker of this.workers.values()) {
                worker.postMessage(envelope);
            }
        }
        const handlers = this.subscriptions.get(topic) || [];
        for (const handler of handlers) handler(data);
    }

    private handleIncoming(raw: any): void {
        const { topic, data } = raw;
        const handlers = this.subscriptions.get(topic) || [];
        for (const handler of handlers) handler(data);
        this.emit('packet', raw);
    }
}
