import { EventEmitter } from 'eventemitter3';
import { TransportManager, TransportOptions } from './TransportManager';
import { NetworkDispatcher } from './NetworkDispatcher';
import { NetworkController } from './NetworkController';
import { MeshOrchestrator } from './MeshOrchestrator';
import { UnifiedServer } from './UnifiedServer';
import { IMeshNode, ILogger, IServiceRegistry, TransportEnvelope } from '../types/mesh.types';
import { Env } from '../utils/Env';

export interface MeshNetworkOptions extends TransportOptions {
    nodeId?: string;
    namespace?: string;
    bootstrapNodes?: string[];
}

/**
 * MeshNetwork: Comprehensive high-level entry point for the networking stack.
 */
export class MeshNetwork extends EventEmitter implements IMeshNode {
    public readonly nodeId: string;
    public readonly namespace: string;
    public readonly logger: ILogger;
    public readonly registry: IServiceRegistry;
    
    public readonly transport: TransportManager;
    public readonly dispatcher: NetworkDispatcher;
    public readonly controller: NetworkController;
    public readonly orchestrator: MeshOrchestrator;
    public readonly server: UnifiedServer | null = null;

    constructor(options: MeshNetworkOptions, logger: ILogger, registry: IServiceRegistry) {
        super();
        this.nodeId = options.nodeId || `node_${Math.random().toString(36).substr(2, 9)}`;
        this.namespace = options.namespace || 'default';
        this.logger = logger;
        this.registry = registry;

        if (Env.isNode()) {
            this.server = new UnifiedServer(options.port);
        }

        this.transport = new TransportManager(options, this);
        this.dispatcher = new NetworkDispatcher(logger);
        this.controller = new NetworkController(this, logger);
        this.orchestrator = new MeshOrchestrator(this, {
            bootstrapNodes: options.bootstrapNodes
        });

        this.controller.registerHandlers(this.dispatcher);

        this.transport.on('packet', async (packet: unknown) => {
            await this.dispatcher.dispatch(packet as TransportEnvelope);
        });
    }

    async start(): Promise<void> {
        if (this.server) {
            await this.server.listen();
        }
        await this.transport.connect({});
        await this.orchestrator.start();
        this.emit('started');
    }

    async stop(): Promise<void> {
        await this.orchestrator.stop();
        await this.transport.disconnect();
        if (this.server) {
            await this.server.stop();
        }
        this.emit('stopped');
    }

    async send(nodeID: string, topic: string, data: Record<string, unknown>): Promise<void> {
        return this.transport.send(nodeID, { topic, data, senderNodeID: this.nodeId });
    }

    async publish(topic: string, data: Record<string, unknown>): Promise<void> {
        return this.transport.publish(topic, data);
    }

    onMessage(topic: string, handler: (data: Record<string, unknown>, packet: TransportEnvelope) => void): void {
        this.dispatcher.on(topic, handler);
    }

    getConfig(): Record<string, unknown> {
        return {};
    }
}
