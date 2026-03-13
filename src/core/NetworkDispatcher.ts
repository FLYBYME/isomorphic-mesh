import { ILogger, TransportEnvelope } from '../types/mesh.types';

export type NetworkHandler = (data: Record<string, unknown>, packet: TransportEnvelope) => void | Promise<void>;

interface RateLimitInfo {
    count: number;
    resetAt: number;
}

/**
 * NetworkDispatcher - Routes incoming network packets to the appropriate handlers.
 * Includes a built-in Rate Limiting middleware.
 */
export class NetworkDispatcher {
    private handlers: Map<string, NetworkHandler> = new Map();
    private prefixHandlers: Map<string, NetworkHandler> = new Map();
    
    // Rate Limiting
    private rateLimits = new Map<string, RateLimitInfo>();
    private readonly MAX_PACKETS_PER_WINDOW = 1000;
    private readonly WINDOW_MS = 60000;

    constructor(private logger: ILogger) { }

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
    async dispatch(packet: TransportEnvelope): Promise<void> {
        // 1. Rate Limiting Middleware
        if (packet.senderNodeID && !this.checkRateLimit(packet.senderNodeID)) {
            this.logger.warn(`[NetworkDispatcher] Rate limit exceeded for node: ${packet.senderNodeID}`);
            return;
        }

        const isDirect = packet.topic === '__direct';
        const topic = isDirect ? (packet.data?.topic as string) : packet.topic;
        let data = isDirect ? (packet.data as Record<string, unknown>) : (packet.data ?? packet);

        if (isDirect && data && typeof data === 'object' && data.data !== undefined) {
            data = data.data as Record<string, unknown>;
        }

        if (!topic) {
            this.logger.warn('[NetworkDispatcher] Received packet without topic', { packet: packet as unknown as Record<string, unknown> });
            return;
        }

        // 2. Exact Match
        const handler = this.handlers.get(topic);
        if (handler) {
            await handler(data as Record<string, unknown>, packet);
            return;
        }

        // 3. Prefix Match
        for (const [prefix, h] of this.prefixHandlers.entries()) {
            if (topic.startsWith(prefix)) {
                await h(data as Record<string, unknown>, packet);
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
