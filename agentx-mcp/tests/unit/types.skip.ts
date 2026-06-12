import { describe, it, expect } from 'vitest';
import * as typesModule from '../src/types.ts';

describe('types module', () => {
    it('should be defined', () => {
        expect(typesModule).toBeDefined();
    });

    it('has no runtime exports (pure types)', () => {
        expect(Object.keys(typesModule).length).toBe(0);
    });
});