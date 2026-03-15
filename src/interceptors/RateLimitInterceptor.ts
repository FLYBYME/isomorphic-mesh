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
    private cleanupInterval: NodeJS.Timeout;

    constructor(private metrics?: any) {
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // 5 mins
    }

    async onInbound(packet: IMeshPacket): Promise<IMeshPacket> {
        if (!packet.senderNodeID) return packet;

        const tenantID = (packet.meta as any)?.tenant_id || 'default';
        const key = `${tenantID}:${packet.senderNodeID}`;

        if (!this.checkRateLimit(key)) {
            // Emit metrics event if registry is tied
            if (this.metrics) {
                this.metrics.increment('mesh.rate_limit.exceeded', 1, { 
                    senderNodeID: packet.senderNodeID,
                    tenantID
                });
            }

            // Drop packet by returning a special topic
            return { ...packet, topic: '__dropped', data: undefined };
        }

        return packet;
    }

    private checkRateLimit(key: string): boolean {
        const now = Date.now();
        let info = this.rateLimits.get(key);

        if (!info || now > info.resetAt) {
            info = { count: 1, resetAt: now + this.WINDOW_MS };
            this.rateLimits.set(key, info);
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
        for (const [key, info] of this.rateLimits.entries()) {
            if (now > info.resetAt) {
                this.rateLimits.delete(key);
            }
        }
    }

    public stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}
