import { IMeshNode, ILogger, NodeInfo } from '../types/mesh.types';

export interface MeshOrchestratorOptions {
    bootstrapNodes?: string[];
    gossipIntervalMs?: number;
}

/**
 * MeshOrchestrator — manages the DHT overlay network lifecycle and gossip.
 */
export class MeshOrchestrator {
    private logger: ILogger;
    private gossipInterval: NodeJS.Timeout | null = null;

    constructor(
        private node: IMeshNode,
        private options: MeshOrchestratorOptions = {}
    ) {
        this.logger = node.logger.child({ name: 'MeshOrchestrator' });
    }

    async start(): Promise<void> {
        this.logger.info(`MeshOrchestrator starting with ${this.options.bootstrapNodes?.length || 0} bootstrap nodes`);

        if (this.options.bootstrapNodes?.length) {
            await this.bootstrap();
        }

        // Start Gossip interval
        this.gossipInterval = setInterval(() => this.gossipRound(), this.options.gossipIntervalMs || 10000);
    }

    async stop(): Promise<void> {
        if (this.gossipInterval) clearInterval(this.gossipInterval);
    }

    private async bootstrap(): Promise<void> {
        for (const addr of this.options.bootstrapNodes || []) {
            try {
                this.logger.info(`Bootstrapping from ${addr}`);
                // In a full implementation, we'd send a join request
            } catch (err) {
                this.logger.warn(`Failed to bootstrap from ${addr}`);
            }
        }
    }

    /**
     * Gossip Protocol: Periodically exchange known peer lists (PEX).
     */
    private async gossipRound(): Promise<void> {
        const nodes = this.node.registry.getAvailableNodes();
        if (nodes.length === 0) return;

        // Select a random peer to gossip with
        const target = nodes[Math.floor(Math.random() * nodes.length)];
        this.logger.debug(`Gossip: Exchanging peer list with ${target.nodeID}`);

        // Send a random subset of our known nodes (max 50) to prevent saturating the network
        const allKnown = this.node.registry.getNodes()
            .filter(n => n.nodeID !== target.nodeID);
        
        const subset = allKnown.sort(() => 0.5 - Math.random()).slice(0, 50);

        const peers = subset.map(n => ({
            nodeID: n.nodeID,
            addresses: n.addresses,
            namespace: n.namespace,
            type: n.type
        }));

        // We use the node's emit/publish mechanism via the dispatcher or direct transport
        // For simplicity, we assume the dispatcher handles '$node.pex'
        this.node.publish('$node.pex', {
            peers
        }).catch(() => {});
    }

    /**
     * Handles incoming Peer Exchange (PEX) data.
     */
    async handlePEX(data: { peers: Partial<NodeInfo>[] }): Promise<void> {
        if (!data.peers || !Array.isArray(data.peers)) return;

        for (const peer of data.peers) {
            if (!peer.nodeID || peer.nodeID === this.node.nodeID) continue;

            const existing = this.node.registry.getNode(peer.nodeID);
            if (!existing) {
                this.logger.info(`Gossip: Discovered new node ${peer.nodeID} via PEX`);
                // Register as a skeleton node, heartbeat will fill details
                this.node.registry.registerNode({
                    nodeID: peer.nodeID,
                    addresses: peer.addresses || [],
                    namespace: peer.namespace || 'default',
                    type: peer.type || 'unknown',
                    available: true,
                    timestamp: Date.now(),
                    nodeSeq: 0,
                    hostname: 'unknown',
                    services: []
                });
            }
        }
    }
}
