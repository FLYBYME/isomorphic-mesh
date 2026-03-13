import { JSONSerializer } from '../src/serializers/JSONSerializer';
import { BinarySerializer } from '../src/serializers/BinarySerializer';
import { ProtoBufSerializer } from '../src/serializers/ProtoBufSerializer';

describe('Serializers', () => {
    it('JSONSerializer serializes and deserializes', () => {
        const js = new JSONSerializer();
        const data = { a: 1 };
        const serialized = js.serialize(data);
        expect(serialized).toBeInstanceOf(Uint8Array);
        
        const deserialized1 = js.deserialize(serialized);
        expect(deserialized1).toEqual(data);

        const deserialized2 = js.deserialize(JSON.stringify(data));
        expect(deserialized2).toEqual(data);

        const deserialized3 = js.deserialize(Buffer.from(JSON.stringify(data)));
        expect(deserialized3).toEqual(data);
    });

    it('BinarySerializer serializes and deserializes', () => {
        const bin = new BinarySerializer();
        const data = { a: 1 };
        const serialized = bin.serialize(data);
        expect(serialized).toBeInstanceOf(Uint8Array);

        const deserialized1 = bin.deserialize(serialized);
        expect(deserialized1).toEqual(data);

        const deserialized2 = bin.deserialize(JSON.stringify(data));
        expect(deserialized2).toEqual(data);
    });

    it('ProtoBufSerializer serializes and deserializes', () => {
        const pb = new ProtoBufSerializer();
        const data = { a: 1 };
        const serialized = pb.serialize(data);
        expect(serialized).toBeInstanceOf(Uint8Array);

        const deserialized1 = pb.deserialize(serialized);
        expect(deserialized1).toEqual(data);

        const deserialized2 = pb.deserialize(JSON.stringify(data));
        expect(deserialized2).toEqual(data);
    });
});
