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
import { RateLimitInterceptor } from '../interceptors/RateLimitInterceptor';
import { CircuitBreakerInterceptor } from '../interceptors/CircuitBreakerInterceptor';
import { WorkerProxyInterceptor } from '../interceptors/WorkerProxyInterceptor';
import { TCPTransport } from '../transports/node/TCPTransport';
import { WSTransport } from '../transports/node/WSTransport';

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

    private interceptors: IInterceptor<MeshPacket, MeshPacket>[] = [];
    private rateLimiter: RateLimitInterceptor;
    private circuitBreaker: CircuitBreakerInterceptor;

    constructor(options: MeshNetworkOptions, logger: ILogger, registry: IServiceRegistry) {
        super();
        this.nodeID = options.nodeId || `node_${Math.random().toString(36).substr(2, 9)}`;
        this.namespace = options.namespace || 'default';
        this.logger = logger;
        this.registry = registry;

        if (Env.isNode()) {
            this.server = new UnifiedServer(options.port);
        }

        this.transport = new TransportManager(options, this as IMeshNetwork);
        this.dispatcher = new NetworkDispatcher(
            this.logger,
            this.registry,
            this.nodeID,
            (nodeID, packet) => this.transport.send(nodeID, packet)
        );
        this.controller = new NetworkController(this as IMeshNetwork, this.logger);
        this.orchestrator = new MeshOrchestrator(this as IMeshNetwork, {
            bootstrapNodes: options.bootstrapNodes
        });

        // Set orchestrator on IMeshNode interface
        (this as unknown as { orchestrator: MeshOrchestrator }).orchestrator = this.orchestrator;

        this.controller.registerHandlers(this.dispatcher);

        // Initialize Resiliency Interceptors
        this.rateLimiter = new RateLimitInterceptor();
        this.circuitBreaker = new CircuitBreakerInterceptor();

        // Register default routing interceptors
        this.use(this.rateLimiter as any);
        this.use(this.circuitBreaker as any);
        this.use(new WorkerProxyInterceptor(this.nodeID, this.registry, (t) => this.dispatcher.hasHandler(t)) as any);
        this.use(new RoutingInterceptor(this.nodeID, this.transport) as any);
        this.use(new TraceInterceptor() as any);

        this.transport.on('packet', async (packet: MeshPacket) => {
            // Track Resiliency Status
            if (packet.type === 'RESPONSE_ERROR') {
                this.circuitBreaker.recordFailure(packet.senderNodeID);
            } else if (packet.type === 'RESPONSE') {
                this.circuitBreaker.recordSuccess(packet.senderNodeID);
            }

            let processedData: MeshPacket = packet;

            // Execute Inbound Pipeline
            for (const interceptor of [...this.interceptors].reverse()) {
                if (interceptor.onInbound) {
                    processedData = await interceptor.onInbound(processedData);
                }
            }

            await this.dispatcher.dispatch(processedData);
        });
    }

    public use(interceptor: IInterceptor<MeshPacket, MeshPacket>): void {
        this.interceptors.push(interceptor);
    }
    /**
     * Ties a metrics registry to the network stack for resiliency event tracking.
     */
    public setMetrics(metrics: { increment(name: string, value: number, labels?: Record<string, string>): void }): void {
        // Update existing interceptors with the metrics registry
        (this.rateLimiter as unknown as { metrics: unknown }).metrics = metrics;
        (this.circuitBreaker as unknown as { metrics: unknown }).metrics = metrics;
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
        this.rateLimiter.stop();
        this.dispatcher.stop();
        if (this.server) {
            await this.server.stop();
        }
    }

    async send<T = unknown>(targetNodeID: string, topic: string, data: T, options?: Partial<IMeshPacket<T>>): Promise<void> {
        let priority = options?.priority ?? 1; // Default Normal

        // Auto-detect QoS for critical infrastructure topics
        if (topic.startsWith('raft.') || topic.startsWith('kademlia.')) {
            priority = 2; // High Priority
        }

        let packet: MeshPacket = {
            topic,
            data,
            id: options?.id || `mesh_${Math.random().toString(36).substr(2, 9)}`,
            type: options?.type as any || 'EVENT',
            senderNodeID: this.nodeID,
            timestamp: Date.now(),
            version: TCPTransport.PROTOCOL_VERSION, // Use common version
            priority,
            meta: options?.meta || {}
        } as MeshPacket;

        // Execute Outbound Pipeline
        for (const interceptor of this.interceptors) {
            if (interceptor.onOutbound) {
                packet = await interceptor.onOutbound(packet);
            }
        }

        if (packet.topic === '__circuit_open') {
            throw new Error(`Circuit open for node ${targetNodeID}`);
        }

        await this.transport.send(targetNodeID, packet);
    }


    async publish<T>(topic: string, data: T): Promise<void> {
        let priority = 1;
        if (topic.startsWith('raft.') || topic.startsWith('kademlia.')) {
            priority = 2;
        }

        const packet: IMeshPacket = {
            topic,
            data,
            id: `mesh_${Math.random().toString(36).substr(2, 9)}`,
            type: 'EVENT',
            senderNodeID: this.nodeID,
            timestamp: Date.now(),
            version: TCPTransport.PROTOCOL_VERSION,
            priority,
            meta: {}
        };

        return this.transport.publish(topic, packet as MeshPacket);
    }

    onMessage<T>(topic: string, handler: IMeshNetworkSubscriptionHandler<T>): void {
        this.dispatcher.on(topic, handler as (data: unknown, packet: MeshPacket) => void);
    }
}
