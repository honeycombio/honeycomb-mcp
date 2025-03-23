import { describe, it, expect } from 'vitest';
import { 
  isValidNumber, 
  isValidString, 
  isValidArray, 
  isValidObject, 
  hasProperty,
  hasPropertyOfType
} from './typeguards.js';

describe('Type Guards', () => {
  describe('isValidNumber', () => {
    it('should correctly identify valid numbers', () => {
      expect(isValidNumber(123)).toBe(true);
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(-456)).toBe(true);
      expect(isValidNumber(3.14)).toBe(true);
    });

    it('should correctly reject non-numbers', () => {
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(undefined)).toBe(false);
      expect(isValidNumber('123')).toBe(false);
      expect(isValidNumber({})).toBe(false);
      expect(isValidNumber([])).toBe(false);
      expect(isValidNumber(NaN)).toBe(false);
    });
  });

  describe('isValidString', () => {
    it('should correctly identify valid strings', () => {
      expect(isValidString('hello')).toBe(true);
      expect(isValidString('')).toBe(true);
      expect(isValidString(`template string`)).toBe(true);
    });

    it('should correctly reject non-strings', () => {
      expect(isValidString(null)).toBe(false);
      expect(isValidString(undefined)).toBe(false);
      expect(isValidString(123)).toBe(false);
      expect(isValidString({})).toBe(false);
      expect(isValidString([])).toBe(false);
    });
  });

  describe('isValidArray', () => {
    it('should correctly identify valid arrays', () => {
      expect(isValidArray([])).toBe(true);
      expect(isValidArray([1, 2, 3])).toBe(true);
      expect(isValidArray(['a', 'b', 'c'])).toBe(true);
      expect(isValidArray(new Array())).toBe(true);
    });

    it('should correctly reject non-arrays', () => {
      expect(isValidArray(null)).toBe(false);
      expect(isValidArray(undefined)).toBe(false);
      expect(isValidArray(123)).toBe(false);
      expect(isValidArray('string')).toBe(false);
      expect(isValidArray({})).toBe(false);
    });
  });

  describe('isValidObject', () => {
    it('should correctly identify valid objects', () => {
      expect(isValidObject({})).toBe(true);
      expect(isValidObject({ key: 'value' })).toBe(true);
      expect(isValidObject(new Object())).toBe(true);
    });

    it('should correctly reject non-objects', () => {
      expect(isValidObject(null)).toBe(false);
      expect(isValidObject(undefined)).toBe(false);
      expect(isValidObject(123)).toBe(false);
      expect(isValidObject('string')).toBe(false);
      expect(isValidObject([])).toBe(false);
    });
  });

  describe('hasProperty', () => {
    it('should correctly identify objects with specific properties', () => {
      expect(hasProperty({ name: 'John' }, 'name')).toBe(true);
      expect(hasProperty({ key: null }, 'key')).toBe(true);
      expect(hasProperty({ a: 1, b: 2 }, 'a')).toBe(true);
    });

    it('should correctly reject objects without specific properties', () => {
      expect(hasProperty({}, 'name')).toBe(false);
      expect(hasProperty({ other: 'prop' }, 'name')).toBe(false);
      expect(hasProperty(null, 'name')).toBe(false);
      expect(hasProperty(undefined, 'name')).toBe(false);
      expect(hasProperty(123, 'toString')).toBe(false); // Not an object
    });
  });

  describe('hasPropertyOfType', () => {
    it('should correctly identify objects with properties of specific types', () => {
      expect(hasPropertyOfType({ age: 30 }, 'age', isValidNumber)).toBe(true);
      expect(hasPropertyOfType({ name: 'John' }, 'name', isValidString)).toBe(true);
      expect(hasPropertyOfType({ items: [1, 2, 3] }, 'items', isValidArray)).toBe(true);
      expect(hasPropertyOfType({ meta: { id: 1 } }, 'meta', isValidObject)).toBe(true);
    });

    it('should correctly reject objects with properties of incorrect types', () => {
      expect(hasPropertyOfType({ age: '30' }, 'age', isValidNumber)).toBe(false);
      expect(hasPropertyOfType({ name: 123 }, 'name', isValidString)).toBe(false);
      expect(hasPropertyOfType({ items: {} }, 'items', isValidArray)).toBe(false);
      expect(hasPropertyOfType({ meta: [1, 2, 3] }, 'meta', isValidObject)).toBe(false);
      expect(hasPropertyOfType({}, 'missing', isValidString)).toBe(false);
      expect(hasPropertyOfType(null, 'any', isValidString)).toBe(false);
    });
  });
});