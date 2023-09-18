// For type ergonomics. Could also just manually cast for each instance
export function cast0x(str: string): `0x${string}` {
    return str as `0x${string}`;
}