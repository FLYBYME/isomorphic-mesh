import { EventEmitter } from 'eventemitter3';
import { TransportManager, TransportOptions } from './TransportManager';
import { NetworkDispatcher } from './NetworkDispatcher';
import { NetworkController } from './NetworkController';
import { MeshOrchestrator } from './MeshOrchestrator';
import { UnifiedServer } from './UnifiedServer';
import { IMeshNetwork, ILogger, IServiceRegistry, IMeshPacket, IMeshNetworkSubscriptionHandler } from 'isomorphic-core';
import { MeshPacket } from '../types/packet.types';
import { Env } from '../utils/Env';
import { IInterceptor } from 'isomorphic-core';
import { RoutingInterceptor } from '../interceptors/RoutingInterceptor';
import { TraceInterceptor } from '../interceptors/TraceInterceptor';

export interface MeshNetworkOptions extends TransportOptions {
    nodeId?: string;
    namespace?: string;
    bootstrapNodes?: string[];
}

/**
 * MeshNetwork: Comprehensive high-level entry point for the networking stack.
 */
export class MeshNetwork extends EventEmitter implements IMeshNetwork {
    public readonly nodeID: string;
    public readonly namespace: string;
    public readonly logger: ILogger;
    public readonly registry: IServiceRegistry;
    
    public readonly transport: TransportManager;
    public readonly dispatcher: NetworkDispatcher;
    public readonly controller: NetworkController;
    public readonly orchestrator: MeshOrchestrator;
    public readonly server: UnifiedServer | null = null;

    private interceptors: IInterceptor<IMeshPacket, IMeshPacket>[] = [];

    constructor(options: MeshNetworkOptions, logger: ILogger, registry: IServiceRegistry) {
        super();
        this.nodeID = options.nodeId || `node_${Math.random().toString(36).substr(2, 9)}`;
        this.namespace = options.namespace || 'default';
        this.logger = logger;
        this.registry = registry;

        if (Env.isNode()) {
            this.server = new UnifiedServer(options.port);
        }

        this.transport = new TransportManager(options, this as IMeshNetwork as any); 
        this.dispatcher = new NetworkDispatcher(
            this.logger, 
            this.registry as any, 
            this.nodeID, 
            (nodeID, packet) => this.transport.send(nodeID, packet)
        );
        this.controller = new NetworkController(this as IMeshNetwork as any, this.logger);
        this.orchestrator = new MeshOrchestrator(this as IMeshNetwork as any, {
            bootstrapNodes: options.bootstrapNodes
        });

        this.controller.registerHandlers(this.dispatcher);

        // Register default routing interceptors
        this.use(new RoutingInterceptor(this.nodeID, this.transport));
        this.use(new TraceInterceptor());

        this.transport.on('packet', async (packet: MeshPacket) => {
            let processedData: IMeshPacket = packet;

            // Execute Inbound Pipeline
            for (const interceptor of [...this.interceptors].reverse()) {
                if (interceptor.onInbound) {
                    processedData = await interceptor.onInbound(processedData);
                }
            }
            
            await this.dispatcher.dispatch(processedData as MeshPacket);
        });
    }

    public use(interceptor: IInterceptor<IMeshPacket, IMeshPacket>): void {
        this.interceptors.push(interceptor);
    }

    async start(): Promise<void> {
        console.log(`[MeshNetwork] Starting node ${this.nodeID}, server is:`, this.server);
        if (this.server) {
            console.log(`[MeshNetwork] Calling server.listen()`);
            await this.server.listen();
        }
        await this.transport.connect({});
        await this.orchestrator.start();
    }

    async stop(): Promise<void> {
        await this.orchestrator.stop();
        await this.transport.disconnect();
        if (this.server) {
            await this.server.stop();
        }
    }

    async send<T>(targetNodeID: string, topic: string, data: T, options?: Partial<IMeshPacket<T>>): Promise<void> {
        let packet: IMeshPacket = {
            topic,
            data,
            id: options?.id || `mesh_${Math.random().toString(36).substr(2, 9)}`,
            type: options?.type || 'EVENT',
            senderNodeID: this.nodeID,
            timestamp: Date.now(),
            meta: options?.meta
        };

        // Execute Outbound Pipeline
        for (const interceptor of this.interceptors) {
            if (interceptor.onOutbound) {
                packet = await interceptor.onOutbound(packet);
            }
        }

        return this.transport.send(targetNodeID, packet as MeshPacket);
    }

    async publish<T>(topic: string, data: T): Promise<void> {
        let packet: IMeshPacket = {
            topic,
            data,
            id: `msg_${Math.random().toString(36).substr(2, 9)}`,
            type: 'EVENT',
            senderNodeID: this.nodeID,
            timestamp: Date.now()
        };

        // Execute Outbound Pipeline
        for (const interceptor of this.interceptors) {
            if (interceptor.onOutbound) {
                packet = await interceptor.onOutbound(packet);
            }
        }

        return this.transport.publish(topic, packet as MeshPacket);
    }

    onMessage<T>(topic: string, handler: IMeshNetworkSubscriptionHandler<T>): void {
        this.dispatcher.on(topic, handler as any);
    }
}
