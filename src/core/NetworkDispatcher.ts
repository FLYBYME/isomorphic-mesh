import { ILogger, IServiceRegistry } from '../types/mesh.types';
import { MeshPacket } from '../types/packet.types';

export type NetworkHandler = (data: any, packet: MeshPacket) => void | Promise<void>;

/**
 * NetworkDispatcher - Routes incoming network packets to the appropriate handlers.
 * Includes Hub-and-Spoke Proxy logic.
 */
export class NetworkDispatcher {
    private handlers: Map<string, NetworkHandler> = new Map();
    private prefixHandlers: Map<string, NetworkHandler> = new Map();
    
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

        // 1. Hub-and-Spoke Proxy Logic
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

        // 2. Exact Match
        const handler = this.handlers.get(topic);
        if (handler) {
            await handler(data, packet);
            return;
        }

        // 3. Prefix Match
        for (const [prefix, h] of this.prefixHandlers.entries()) {
            if (topic.startsWith(prefix)) {
                await h(data, packet);
                return;
            }
        }
        
        this.logger.debug(`[NetworkDispatcher] No handler registered for topic: ${topic}`);
    }
}
