import { IInterceptor, IMeshPacket } from 'isomorphic-core';
import { nanoid } from 'nanoid';

/**
 * TraceInterceptor — Hydrates and injects distributed tracing context.
 * Adheres to strict typing for tracing metadata.
 */
export class TraceInterceptor implements IInterceptor<IMeshPacket, IMeshPacket> {
    public readonly name = 'trace-interceptor';

    /**
     * Inbound: Extract tracing context from packet metadata to hydrate the mesh context.
     */
    onInbound(packet: IMeshPacket): IMeshPacket {
        const meta = packet.meta as {
            traceId?: string;
            spanId?: string;
            parentId?: string;
        } | undefined;

        // If tracing meta exists, we ensure it's available for the ServiceBroker to pick up.
        // The ServiceBroker will use these fields to populate the IContext.
        if (meta?.traceId) {
            return {
                ...packet,
                meta: {
                    ...packet.meta,
                    traceId: meta.traceId,
                    spanId: meta.spanId,
                    parentId: meta.parentId
                }
            };
        }

        return packet;
    }

    /**
     * Outbound: Inject current tracing context into packet metadata.
     */
    onOutbound(packet: IMeshPacket): IMeshPacket {
        // In a real implementation, we would pull from AsyncLocalStorage via broker.getContext().
        // For the interceptor, we ensure that if the packet already has tracing meta (from broker), 
        // it is strictly preserved and formatted.
        const meta = packet.meta as {
            traceId?: string;
            spanId?: string;
            parentId?: string;
        } | undefined;

        if (meta?.traceId) {
            return {
                ...packet,
                meta: {
                    ...packet.meta,
                    traceId: meta.traceId,
                    spanId: meta.spanId,
                    parentId: meta.parentId
                }
            };
        }

        // If no trace exists (originating request), we could generate one here,
        // but typically the ServiceBroker should have already initialized it.
        return packet;
    }
}
