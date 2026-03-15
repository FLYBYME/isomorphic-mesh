import { z } from 'zod';
import { NetworkStatsSchema } from './network.schema';

declare module 'isomorphic-core' {
    interface IServiceActionRegistry {
        'network.getStats': {
            params: z.ZodObject<{}>;
            returns: typeof NetworkStatsSchema;
        };
    }
}

export const NetworkContract = {
    name: 'network',
    actions: {
        getStats: {
            params: z.object({}),
            returns: NetworkStatsSchema
        }
    }
};
