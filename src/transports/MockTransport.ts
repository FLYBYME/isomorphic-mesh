import { BaseTransport } from './BaseTransport';
import { MeshPacket } from '../types/packet.types';
import { TransportConnectOptions } from '../types/mesh.types';

/**
 * MockTransport — A simple in-memory transport for testing.
 * Uses a static map to simulate "The Network".
 */
export class MockTransport extends BaseTransport {
    public readonly protocol = 'mock';
    private static instances = new Map<string, MockTransport>();

    async connect(opts: TransportConnectOptions): Promise<void> {
        this.nodeID = opts.nodeID;
        MockTransport.instances.set(this.nodeID, this);
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        MockTransport.instances.delete(this.nodeID);
        this.connected = false;
    }

    async send(nodeID: string, packet: MeshPacket): Promise<void> {
        const target = MockTransport.instances.get(nodeID);
        if (target) {
            // Simulate async network latency - must be > 0 to allow Map set() to finish
            setTimeout(() => target.emit('packet', packet), 5);
        }
    }

    async publish(topic: string, packet: MeshPacket): Promise<void> {
        for (const [nodeID, instance] of MockTransport.instances.entries()) {
            if (nodeID !== this.nodeID) {
                setTimeout(() => instance.emit('packet', packet), 5);
            }
        }
    }
}
