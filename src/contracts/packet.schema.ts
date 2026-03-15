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
    }).default({
        ttl: 5,
        path: []
    }),
});

export type IMeshPacket = z.infer<typeof MeshPacketSchema>;
