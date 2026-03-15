import { IMeshModule, IMeshApp, ILogger, IServiceBroker, IServiceRegistry } from 'isomorphic-core';
import { MeshNetwork, MeshNetworkOptions } from '../core/MeshNetwork';
import { NetworkPlugin } from '../NetworkPlugin';

/**
 * NetworkModule — Manages the lifecycle and configuration of the Mesh Network.
 * Implements the "Self-Installing" pattern by piping the NetworkPlugin into the Broker.
 */
export class NetworkModule implements IMeshModule {
    public readonly name = 'network';
    public logger!: ILogger;
    public serviceBroker!: IServiceBroker;
    private network!: MeshNetwork;
    private plugin!: NetworkPlugin;

    constructor(private options: Partial<MeshNetworkOptions> = {}) {}

    onInit(app: IMeshApp): void {
        const registry = app.getProvider<IServiceRegistry>('registry');
        this.logger = app.getProvider<ILogger>('logger') || app.logger;
        this.serviceBroker = app.getProvider<IServiceBroker>('broker');

        if (!this.serviceBroker) {
            this.logger.warn('[NetworkModule] ServiceBroker not found during onInit. NetworkPlugin may not be installed.');
        }

        // 1. Initialize the Network stack
        const fullOptions: MeshNetworkOptions & { logger: ILogger } = {
            port: this.options.port || 4000,
            host: this.options.host || '0.0.0.0',
            serializerType: this.options.serializerType || 'json',
            transportType: this.options.transportType || 'tcp',
            ...this.options,
            logger: this.logger
        };

        this.network = new MeshNetwork(app.nodeID, registry, fullOptions);

        // 2. Create the Plugin
        this.plugin = new NetworkPlugin(this.network);

        // 3. Self-Install: Pipe into the broker
        if (this.serviceBroker) {
            this.serviceBroker.pipe(this.plugin);
            this.logger.info('[NetworkModule] NetworkPlugin successfully piped into ServiceBroker.');
        }

        // 4. Register provider for DI
        app.registerProvider('network', this.network);
    }

    public getNetwork(): MeshNetwork {
        return this.network;
    }

    async onStart(): Promise<void> {
        // Startup logic is handled by plugin.onStart via broker.start()
    }

    async onStop(): Promise<void> {
        if (this.network) {
            await this.network.stop();
        }
    }
}
