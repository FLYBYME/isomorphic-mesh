import { EventEmitter } from 'eventemitter3';
import { TransportManager, TransportOptions } from './TransportManager';
import { NetworkDispatcher } from './NetworkDispatcher';
import { NetworkController } from './NetworkController';
import { MeshOrchestrator } from './MeshOrchestrator';
import { UnifiedServer } from './UnifiedServer';
import { IMeshNode, ILogger, IServiceRegistry } from '../types/mesh.types';
import { MeshPacket } from '../types/packet.types';
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

        this.transport.on('packet', async (packet: MeshPacket) => {
            await this.dispatcher.dispatch(packet);
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

    async send(nodeID: string, topicOrPacket: string | MeshPacket, data?: unknown): Promise<void> {
        if (typeof topicOrPacket !== 'string') {
            return this.transport.send(nodeID, topicOrPacket);
        }
        return this.transport.send(nodeID, {
            topic: topicOrPacket,
            data,
            id: `mesh_${Math.random().toString(36).substr(2, 9)}`,
            type: 'EVENT',
            senderNodeID: this.nodeId,
            timestamp: Date.now()
        } as MeshPacket);
    }

    async publish(topic: string, data: unknown): Promise<void> {
        return this.transport.publish(topic, {
            topic,
            data,
            id: `msg_${Math.random().toString(36).substr(2, 9)}`,
            type: 'EVENT',
            senderNodeID: this.nodeId,
            timestamp: Date.now()
        } as MeshPacket);
    }

    onMessage(topic: string, handler: (data: unknown, packet: MeshPacket) => void): void {
        this.dispatcher.on(topic, handler as any);
    }

    getConfig(): Record<string, unknown> {
        return {};
    }
}
