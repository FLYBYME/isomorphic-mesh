import { ILogger, TransportEnvelope } from '../types/mesh.types';

export type NetworkHandler = (data: Record<string, unknown>, packet: TransportEnvelope) => void | Promise<void>;

/**
 * NetworkDispatcher - Routes incoming network packets to the appropriate handlers.
 */
export class NetworkDispatcher {
    private handlers: Map<string, NetworkHandler> = new Map();
    private prefixHandlers: Map<string, NetworkHandler> = new Map();

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

        // 1. Try exact match
        const handler = this.handlers.get(topic);
        if (handler) {
            await handler(data as Record<string, unknown>, packet);
            return;
        }

        // 2. Try prefix match
        for (const [prefix, h] of this.prefixHandlers.entries()) {
            if (topic.startsWith(prefix)) {
                await h(data as Record<string, unknown>, packet);
                return;
            }
        }
        
        this.logger.debug(`[NetworkDispatcher] No handler registered for topic: ${topic}`);
    }
}
