import { IMeshNode, ILogger } from '../types/mesh.types';
import { MeshPacket } from '../types/packet.types';
import { NetworkDispatcher } from './NetworkDispatcher';

/**
 * NetworkController - Handles standard mesh packets.
 */
export class NetworkController {
    constructor(
        private node: IMeshNode,
        private logger: ILogger
    ) {}

    public registerHandlers(dispatcher: NetworkDispatcher): void {
        dispatcher.on('$node.ping', (data, packet) => this.handlePing(packet));
        dispatcher.on('$node.pong', (data, packet) => this.handlePong(data, packet));
        dispatcher.on('$node.pex', (data, packet) => this.handlePex(data, packet));
        dispatcher.on('$node.announce', (data, packet) => this.handleAnnounce(data, packet));
        dispatcher.on('$rpc.request', (data, packet) => this.handleRPCRequest(data, packet));
        dispatcher.on('$rpc.response', (data, packet) => this.handleRPCResponse(data, packet));
    }

    private async handleAnnounce(data: any, packet: MeshPacket): Promise<void> {
        if (packet.senderNodeID === this.node.nodeID) return;
        this.node.registry.registerNode({
            nodeID: packet.senderNodeID,
            type: 'node',
            namespace: 'default', // Ideally from data or config
            addresses: [],
            available: true,
            timestamp: Date.now(),
            nodeSeq: data.nodeSeq || 0,
            hostname: data.hostname || 'unknown',
            services: (data.services as any[]) || []
        });
    }

    private async handlePing(packet: MeshPacket): Promise<void> {
        if (packet.senderNodeID === this.node.nodeID) return;
        const net = this.node as unknown as { publish(topic: string, data: unknown): void };
        net.publish('$node.pong', { id: packet.id, timestamp: Date.now() });
    }

    private async handlePong(data: any, packet: MeshPacket): Promise<void> {
        this.logger.debug('Ping response received', { from: packet.senderNodeID });
    }

    private async handlePex(data: any, packet: MeshPacket): Promise<void> {
        const net = this.node as unknown as { orchestrator: { updatePeers(nodes: any[]): void } };
        const orchestrator = net.orchestrator;
        if (orchestrator && data.nodes) {
            orchestrator.updatePeers(data.nodes);
        }
    }

    private async handleRPCRequest(data: any, packet: MeshPacket): Promise<void> {
        this.logger.debug('Incoming RPC request', { action: data.action as string });
    }

    private async handleRPCResponse(data: any, packet: MeshPacket): Promise<void> {
        // Handled by Transport internally if it has correlation logic
    }
}
