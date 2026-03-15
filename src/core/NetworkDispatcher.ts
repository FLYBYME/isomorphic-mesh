import { ILogger, IServiceRegistry } from '../types/mesh.types';
import { MeshPacket } from '../types/packet.types';

export type NetworkHandler = (data: any, packet: MeshPacket) => void | Promise<void>;

interface RateLimitInfo {
    count: number;
    resetAt: number;
}

/**
 * NetworkDispatcher - Routes incoming network packets to the appropriate handlers.
 * Includes a built-in Rate Limiting middleware and Hub-and-Spoke Proxy logic.
 */
export class NetworkDispatcher {
    private handlers: Map<string, NetworkHandler> = new Map();
    private prefixHandlers: Map<string, NetworkHandler> = new Map();
    
    // Rate Limiting
    private rateLimits = new Map<string, RateLimitInfo>();
    private readonly MAX_PACKETS_PER_WINDOW = 1000;
    private readonly WINDOW_MS = 60000;

    constructor(
        private logger: ILogger,
        private registry?: IServiceRegistry,
        private nodeID?: string,
        private transportSend?: (nodeID: string, packet: MeshPacket) => Promise<void>
    ) { }

    /**
     * Register a handler for a specific topic or a topic prefix (using *).
     */
    on(topic: string, handler: NetworkHandler): void {
        if (topic.endsWith('*')) {
            this.prefixHandlers.set(topic.slice(0, -1), handler);
        } else {
            this.handlers.set(topic, handler);
        }
    }

    /**
     * Dispatch an incoming packet to the registered handlers.
     */
    async dispatch(packet: MeshPacket): Promise<void> {
        // 1. Rate Limiting Middleware
        if (packet.senderNodeID && !this.checkRateLimit(packet.senderNodeID)) {
            this.logger.warn(`[NetworkDispatcher] Rate limit exceeded for node: ${packet.senderNodeID}`);
            return;
        }

        const isDirect = packet.topic === '__direct';
        const topic = isDirect ? (packet as any).data?.topic as string : packet.topic;
        let data: unknown = isDirect ? (packet as any).data : ((packet as any).data ?? packet);

        if (isDirect && data && typeof data === 'object' && (data as any).data !== undefined) {
            data = (data as any).data;
        }

        if (!topic) {
            this.logger.warn('[NetworkDispatcher] Received packet without topic', { packet: packet as unknown as Record<string, unknown> });
            return;
        }

        // 2. Hub-and-Spoke Proxy Logic
        // If we have a registry and this topic isn't handled locally, check if it's shadowed.
        if (this.registry && !this.handlers.has(topic) && this.transportSend) {
            const nodes = this.registry.getAvailableNodes();
            const worker = nodes.find(n => 
                n.parentID === this.nodeID && 
                n.nodeType === 'worker' &&
                n.services.some(svc => {
                    const svcName = svc.fullName || svc.name;
                    return (svc.actions && Object.keys(svc.actions).some(k => k === topic || `${svcName}.${k}` === topic));
                })
            );

            if (worker) {
                this.logger.debug(`[NetworkDispatcher] Proxying request for ${topic} to worker ${worker.nodeID}`);
                const proxyPacket: MeshPacket = {
                    ...packet,
                    meta: {
                        ...packet.meta,
                        finalDestinationID: worker.nodeID,
                        isProxy: true
                    }
                };
                await this.transportSend(worker.nodeID, proxyPacket);
                return;
            }
        }

        // 3. Exact Match
        const handler = this.handlers.get(topic);
        if (handler) {
            await handler(data, packet);
            return;
        }

        // 4. Prefix Match
        for (const [prefix, h] of this.prefixHandlers.entries()) {
            if (topic.startsWith(prefix)) {
                await h(data, packet);
                return;
            }
        }
        
        this.logger.debug(`[NetworkDispatcher] No handler registered for topic: ${topic}`);
    }

    /**
     * Simple sliding window rate limiter.
     */
    private checkRateLimit(nodeID: string): boolean {
        const now = Date.now();
        let info = this.rateLimits.get(nodeID);

        if (!info || now > info.resetAt) {
            info = { count: 1, resetAt: now + this.WINDOW_MS };
            this.rateLimits.set(nodeID, info);
            return true;
        }

        info.count++;
        if (info.count > this.MAX_PACKETS_PER_WINDOW) {
            return false;
        }

        return true;
    }

    /**
     * Periodically cleanup the rate limit cache.
     */
    public cleanupRateLimits(): void {
        const now = Date.now();
        for (const [nodeID, info] of this.rateLimits.entries()) {
            if (now > info.resetAt) {
                this.rateLimits.delete(nodeID);
            }
        }
    }
}
