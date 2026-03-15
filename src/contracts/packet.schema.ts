import { z } from 'zod';

/**
 * MeshPacketSchema — The single source of truth for all wire communication.
 */
export const MeshPacketSchema = z.object({
    id: z.string().uuid(),
    type: z.enum(['call', 'emit', 'reply', 'error']),
    action: z.string().optional(),
    payload: z.unknown(),
    meta: z.object({
        tenantId: z.string().optional(),
        correlationId: z.string().optional(),
        // Advanced Routing Fields
        ttl: z.number().default(5),
        path: z.array(z.string()).default([]),
        finalDestinationID: z.string().optional(),
        // Tracing Fields
        traceId: z.string().optional(),
        spanId: z.string().optional(),
        parentId: z.string().optional(),
    }).default({
        ttl: 5,
        path: []
    }),
});

export type IMeshPacket = z.infer<typeof MeshPacketSchema>;

/**
 * TelemetryPacketSchema — Specialized schema for log draining and metrics export.
 */
export const TelemetryPacketSchema = z.object({
    id: z.string().uuid(),
    nodeID: z.string(),
    timestamp: z.number(),
    type: z.enum(['log', 'metric']),
    payload: z.discriminatedUnion('type', [
        z.object({
            type: z.literal('log'),
            level: z.enum(['debug', 'info', 'warn', 'error']),
            message: z.string(),
            data: z.record(z.unknown()).optional(),
            traceId: z.string().optional(),
            spanId: z.string().optional(),
        }),
        z.object({
            type: z.literal('metric'),
            name: z.string(),
            metricType: z.enum(['counter', 'gauge', 'histogram']),
            value: z.number(),
            labels: z.record(z.string()).optional(),
        })
    ]),
});

export type TelemetryPacket = z.infer<typeof TelemetryPacketSchema>;
