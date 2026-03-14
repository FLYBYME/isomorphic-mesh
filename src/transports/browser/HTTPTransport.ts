import { BaseTransport } from '../BaseTransport';
import { BaseSerializer } from '../../serializers/BaseSerializer';
import { TransportConnectOptions } from '../../types/mesh.types';
import { MeshPacket } from '../../types/packet.types';

/**
 * HTTPTransport — Browser implementation using fetch.
 */
export class HTTPTransport extends BaseTransport {
    readonly protocol = 'http';
    private peerAddresses = new Map<string, string>();

    constructor(serializer: BaseSerializer) {
        super(serializer);
    }

    async connect(_opts: TransportConnectOptions): Promise<void> {
        this.connected = true;
        this.emit('connected');
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.emit('disconnected');
    }

    async send(nodeID: string, packet: MeshPacket): Promise<void> {
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

    async publish(_topic: string, _packet: MeshPacket): Promise<void> {
        // SSE not implemented in browser stub
    }

    async connectToPeer(nodeID: string, address: string): Promise<void> {
        this.peerAddresses.set(nodeID, address);
    }
}
