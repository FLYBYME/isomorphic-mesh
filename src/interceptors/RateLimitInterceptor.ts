import { IInterceptor, IMeshPacket } from 'isomorphic-core';

interface RateLimitInfo {
    count: number;
    resetAt: number;
}

/**
 * RateLimitInterceptor — Enforces sliding window rate limits on inbound packets.
 * Ties into metrics if a metrics registry is provided.
 */
export class RateLimitInterceptor implements IInterceptor<IMeshPacket, IMeshPacket> {
    public readonly name = 'rate-limit';
    
    private rateLimits = new Map<string, RateLimitInfo>();
    private readonly MAX_PACKETS_PER_WINDOW = 1000;
    private readonly WINDOW_MS = 60000;

    constructor(private metrics?: any) {}

    async onInbound(packet: IMeshPacket): Promise<IMeshPacket> {
        if (!packet.senderNodeID) return packet;

        if (!this.checkRateLimit(packet.senderNodeID)) {
            // Emit metrics event if registry is tied
            if (this.metrics) {
                this.metrics.increment('mesh.rate_limit.exceeded', 1, { 
                    senderNodeID: packet.senderNodeID 
                });
            }

            // Drop packet by returning a special topic
            return { ...packet, topic: '__dropped', data: undefined };
        }

        return packet;
    }

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
    public cleanup(): void {
        const now = Date.now();
        for (const [nodeID, info] of this.rateLimits.entries()) {
            if (now > info.resetAt) {
                this.rateLimits.delete(nodeID);
            }
        }
    }
}
