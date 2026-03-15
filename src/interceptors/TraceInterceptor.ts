import { IInterceptor } from 'isomorphic-core';
import { IMeshPacket } from '../contracts/packet.schema';

/**
 * TraceInterceptor — Hydrates and injects distributed tracing context.
 * Adheres to strict typing for tracing metadata.
 */
export class TraceInterceptor implements IInterceptor<IMeshPacket, IMeshPacket> {
    public readonly name = 'trace-interceptor';

    /**
     * Inbound: Extract tracing context from packet metadata to hydrate the mesh context.
     */
    onInbound(packet: any): any {
        // If tracing meta exists, we ensure it's available for the ServiceBroker to pick up.
        // The ServiceBroker will use these fields to populate the IContext.
        if (packet.meta?.traceId) {
            return {
                ...packet,
                meta: {
                    ...packet.meta,
                    traceId: packet.meta.traceId,
                    spanId: packet.meta.spanId,
                    parentId: packet.meta.parentId
                }
            };
        }

        return packet;
    }

    /**
     * Outbound: Inject current tracing context into packet metadata.
     */
    onOutbound(packet: any): any {
        // The ServiceBroker should have already initialized tracing in the packet meta
        // if it originated from a context with tracing enabled.
        if (packet.meta?.traceId) {
            return {
                ...packet,
                meta: {
                    ...packet.meta,
                    traceId: packet.meta.traceId,
                    spanId: packet.meta.spanId,
                    parentId: packet.meta.parentId
                }
            };
        }

        return packet;
    }
}
