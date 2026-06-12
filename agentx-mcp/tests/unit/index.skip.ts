import { describe, it, expect } from 'vitest';
import * as indexModule from '../src/index.ts';

describe('index module exports', () => {
    it('should export something', () => {
        expect(indexModule).toBeDefined();
    });
});
