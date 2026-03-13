import { IMeshNode, ILogger, TransportEnvelope } from '../types/mesh.types';
import { NetworkDispatcher } from './NetworkDispatcher';

/**
 * NetworkController - Handles standard mesh packets.
 */
export class NetworkController {
    private logger: ILogger;

    constructor(
        private node: IMeshNode,
        logger: ILogger
    ) {
        this.logger = logger.child({ name: 'NetworkController' });
    }

    public registerHandlers(dispatcher: NetworkDispatcher): void {
        dispatcher.on('$node.info', this.handleNodeInfo.bind(this));
        dispatcher.on('$node.heartbeat', this.handleNodeHeartbeat.bind(this));
        dispatcher.on('$node.disconnect', this.handleNodeDisconnect.bind(this));
        dispatcher.on('$node.ping', async () => { });
        
        dispatcher.on('$rpc.request', this.handleRPCRequest.bind(this));
        dispatcher.on('$rpc.response', this.handleRPCResponse.bind(this));
    }

    private async handleNodeInfo(data: Record<string, unknown>, packet: TransportEnvelope): Promise<void> {
        const nodeID = data.nodeID as string;
        if (nodeID && nodeID !== this.node.nodeId) {
            this.node.registry.registerNode({
                nodeID,
                namespace: (data.namespace as string) || 'default',
                addresses: (data.addresses as string[]) || [],
                type: (data.type as string) || 'unknown',
                available: true,
                timestamp: Date.now(),
                capabilities: (data.capabilities as Record<string, unknown>) || {},
                services: (data.services as any[]) || []
            });
            this.logger.info('New node discovered', { remoteNodeID: nodeID });
        }
    }

    private async handleNodeHeartbeat(data: Record<string, unknown>, packet: TransportEnvelope): Promise<void> {
        const nodeID = data.nodeID as string;
        if (nodeID && nodeID !== this.node.nodeId) {
            this.node.registry.heartbeat(nodeID, data);
        }
    }

    private async handleNodeDisconnect(data: Record<string, unknown>, packet: TransportEnvelope): Promise<void> {
        const nodeID = data.nodeID as string;
        if (nodeID && nodeID !== this.node.nodeId) {
            this.node.registry.unregisterNode(nodeID);
        }
    }

    private async handleRPCRequest(data: Record<string, unknown>, packet: TransportEnvelope): Promise<void> {
        this.node.logger.debug('Incoming RPC request', { action: data.action as string });
    }

    private async handleRPCResponse(data: Record<string, unknown>, packet: TransportEnvelope): Promise<void> {
        // Implementation for resolving pending RPC calls
    }
}
