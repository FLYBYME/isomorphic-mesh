import { ILogger } from '../types/mesh.types';

export interface DHTDiscoveryOptions {
    nodeID: string;
    namespace: string;
    bootstrapNodes?: string[];
    logger: ILogger;
}

export class DHTDiscovery {
    private announceTimer: NodeJS.Timeout | null = null;

    constructor(private opts: DHTDiscoveryOptions) { }

    public async start(publicUrl: string): Promise<void> {
        this.opts.logger.info(`Starting DHT discovery for ${this.opts.namespace}`);
        await this.announce(publicUrl);
        this.announceTimer = setInterval(() => this.announce(publicUrl), 300000);
    }

    public async stop(): Promise<void> {
        if (this.announceTimer) clearInterval(this.announceTimer);
    }

    private async announce(address: string): Promise<void> {
        this.opts.logger.debug(`Announcing ${this.opts.nodeID} at ${address}`);
    }

    public async discover(): Promise<string[]> {
        return [];
    }
}
