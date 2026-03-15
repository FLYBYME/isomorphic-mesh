import { z } from 'zod';
import { IContext } from 'isomorphic-core';
import { MeshNetwork } from './core/MeshNetwork';
import { NetworkStatsSchema } from './network.schema';

/**
 * NetworkService — Exposed actions for interacting with the MeshNetwork.
 */
export class NetworkService {
    public readonly name = 'network';

    public actions = {
        getStats: { handler: this.getStats.bind(this) }
    };

    constructor(private network: MeshNetwork) {}

    async getStats(ctx: IContext<any>): Promise<z.infer<typeof NetworkStatsSchema>> {
        // Mocking stats for now, in a real app these come from transport managers
        return {
            nodeID: this.network.nodeID,
            transport: 'tcp', 
            packetsSent: 100,
            packetsReceived: 100,
            connectedNodes: [],
            uptime: process.uptime()
        };
    }
}
