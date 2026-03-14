import { EventEmitter } from 'eventemitter3';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { TransportConnectOptions } from '../types/mesh.types';
import { MeshPacket } from '../types/packet.types';

/**
 * BaseTransport — abstract contract for node-to-node communication.
 */
export abstract class BaseTransport extends EventEmitter {
    abstract readonly protocol: string;

    protected serializer: BaseSerializer;
    protected connected = false;
    protected nodeID: string = 'unknown';
    protected subscriptions = new Map<string, ((data: unknown) => void)[]>();

    constructor(serializer: BaseSerializer) {
        super();
        this.serializer = serializer;
    }

    /** Establish the connection */
    abstract connect(opts: TransportConnectOptions): Promise<void>;

    /** Gracefully close the connection */
    abstract disconnect(): Promise<void>;

    /** Send a packet to a specific node */
    abstract send(nodeID: string, packet: MeshPacket): Promise<void>;

    /** Establish a direct peer connection (optional implementation) */
    async connectToPeer(nodeID: string, url: string, options?: Record<string, unknown>): Promise<void> {
        throw new Error(`Transport ${this.protocol} does not support direct peer connections`);
    }

    /** Subscribe to a topic / channel */
    async subscribe(topic: string): Promise<void> {
        if (!this.subscriptions.has(topic)) {
            this.subscriptions.set(topic, []);
        }
    }

    /** Add a handler callback for a topic */
    addHandler(topic: string, handler: (data: unknown) => void): void {
        const handlers = this.subscriptions.get(topic) ?? [];
        handlers.push(handler);
        this.subscriptions.set(topic, handlers);
    }

    /** Publish a message to a topic */
    abstract publish(topic: string, packet: MeshPacket): Promise<void>;

    isConnected(): boolean {
        return this.connected;
    }

    /** Returns the actual bound port (if applicable) */
    getPort(): number {
        return 0;
    }
}
