import { EventEmitter } from 'eventemitter3';
import { BaseTransport } from '../transports/BaseTransport';
import { BaseSerializer } from '../serializers/BaseSerializer';
import { TransportFactory } from './TransportFactory';
import { IMeshNode, TransportType, SerializerType, TransportConnectOptions } from '../types/mesh.types';
import { MeshPacket } from '../types/packet.types';

export interface TransportOptions {
    transportType: TransportType | TransportType[];
    serializerType: SerializerType;
    port: number;
    host: string;
}

export class TransportManager extends EventEmitter {
    private transports = new Map<TransportType, BaseTransport>();
    private serializer: BaseSerializer;
    private primaryTransport: BaseTransport;
    private primaryType: TransportType;

    constructor(options: TransportOptions, private node: IMeshNode) {
        super();
        const types = Array.isArray(options.transportType) ? options.transportType : [options.transportType];
        this.serializer = TransportFactory.createSerializer(options.serializerType);
        this.primaryType = types[0] || 'ws';

        for (const type of types) {
            const transport = TransportFactory.createTransport(type, this.serializer, options.port);
            transport.on('packet', (envelope: MeshPacket) => this.emit('packet', envelope));
            this.transports.set(type, transport);
        }

        this.primaryTransport = this.transports.get(this.primaryType)!;
    }

    async connect(opts: Partial<TransportConnectOptions>): Promise<void> {
        for (const t of this.transports.values()) {
            await t.connect({
                url: opts.url || '',
                nodeID: this.node.nodeID,
                namespace: this.node.namespace,
                logger: this.node.logger,
                port: opts.port
            });
            
            // Execute transport-specific startup (e.g. proactive replay)
            if ((t as any).start) {
                await (t as any).start();
            }
        }
    }

    async disconnect(): Promise<void> {
        for (const t of this.transports.values()) {
            await t.disconnect();
        }
    }

    getTransport(): BaseTransport {
        return this.primaryTransport;
    }

    getTransportByType<T extends BaseTransport>(type: TransportType): T | undefined {
        return this.transports.get(type) as T;
    }

    async send(nodeID: string, packet: MeshPacket): Promise<void> {
        const transport = this.selectBestRoute(nodeID);
        return transport.send(nodeID, packet);
    }

    private selectBestRoute(nodeID: string): BaseTransport {
        const node = this.node.registry.getNode(nodeID);
        if (!node || !node.addresses) return this.primaryTransport;

        for (const addr of node.addresses) {
            const type = this.getAddressType(addr);
            const t = this.transports.get(type);
            if (t) return t;
        }
        return this.primaryTransport;
    }

    private getAddressType(address: string): TransportType {
        if (address.startsWith('tcp://')) return 'tcp';
        if (address.startsWith('ws://') || address.startsWith('wss://')) return 'ws';
        if (address.startsWith('nats://')) return 'nats';
        if (address.startsWith('http://') || address.startsWith('https://')) return 'http';
        return 'ws';
    }

    async publish(topic: string, packet: MeshPacket): Promise<void> {
        await this.primaryTransport.publish(topic, packet);
    }

    isConnected(): boolean {
        return Array.from(this.transports.values()).some(t => t.isConnected());
    }
}
