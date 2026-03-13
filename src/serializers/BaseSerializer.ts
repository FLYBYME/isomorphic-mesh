/**
 * BaseSerializer — abstract contract for packet serialization.
 */
export abstract class BaseSerializer {
    abstract readonly type: string;

    /** Serialize a payload object into a Uint8Array for transmission */
    abstract serialize(data: Record<string, unknown>): Uint8Array;

    /** Deserialize a Uint8Array back into a payload object */
    abstract deserialize(buf: Uint8Array | ArrayBuffer | string): Record<string, unknown>;
}
