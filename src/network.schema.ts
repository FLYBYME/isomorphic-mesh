import { z } from 'zod';

export const NetworkStatsSchema = z.object({
    nodeID: z.string(),
    transport: z.string(),
    packetsSent: z.number(),
    packetsReceived: z.number(),
    connectedNodes: z.array(z.string()),
    uptime: z.number()
});

export type NetworkStats = z.infer<typeof NetworkStatsSchema>;
