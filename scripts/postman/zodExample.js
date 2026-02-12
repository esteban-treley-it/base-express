const zod = require('zod');

const { ZodFirstPartyTypeKind } = zod;

const unwrapSchema = (schema) => {
    let current = schema;
    while (current && current._def) {
        const typeName = current._def.typeName;
        if (typeName === ZodFirstPartyTypeKind.ZodOptional || typeName === ZodFirstPartyTypeKind.ZodNullable || typeName === ZodFirstPartyTypeKind.ZodDefault) {
            current = current._def.innerType;
            continue;
        }
        if (typeName === ZodFirstPartyTypeKind.ZodEffects) {
            current = current._def.schema;
            continue;
        }
        break;
    }
    return current;
};

const sampleString = (schema) => {
    const checks = schema?._def?.checks || [];
    if (checks.some((check) => check.kind === 'email')) return 'user@example.com';
    if (checks.some((check) => check.kind === 'url')) return 'https://example.com';
    if (checks.some((check) => check.kind === 'uuid')) return '00000000-0000-0000-0000-000000000000';

    const minCheck = checks.find((check) => check.kind === 'min');
    if (minCheck?.value >= 10) return '1234567890';

    return 'string';
};

const exampleForSchema = (schema) => {
    const unwrapped = unwrapSchema(schema);
    if (!unwrapped || !unwrapped._def) return null;

    switch (unwrapped._def.typeName) {
        case ZodFirstPartyTypeKind.ZodString:
            return sampleString(unwrapped);
        case ZodFirstPartyTypeKind.ZodNumber:
            return 0;
        case ZodFirstPartyTypeKind.ZodBoolean:
            return true;
        case ZodFirstPartyTypeKind.ZodDate:
            return new Date().toISOString();
        case ZodFirstPartyTypeKind.ZodLiteral:
            return unwrapped._def.value;
        case ZodFirstPartyTypeKind.ZodEnum:
            return unwrapped._def.values[0];
        case ZodFirstPartyTypeKind.ZodNativeEnum: {
            const values = Object.values(unwrapped._def.values);
            return values[0];
        }
        case ZodFirstPartyTypeKind.ZodArray:
            return [exampleForSchema(unwrapped._def.type)];
        case ZodFirstPartyTypeKind.ZodUnion:
            return exampleForSchema(unwrapped._def.options[0]);
        case ZodFirstPartyTypeKind.ZodObject: {
            const shape = typeof unwrapped._def.shape === 'function' ? unwrapped._def.shape() : unwrapped.shape;
            const result = {};
            for (const [key, value] of Object.entries(shape)) {
                result[key] = exampleForSchema(value);
            }
            return result;
        }
        default:
            return null;
    }
};

module.exports = {
    exampleForSchema,
};
