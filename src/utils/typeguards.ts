/**
 * Type guards and predicates for type safety
 */

/**
 * Type guard to check if a value is a valid number
 * 
 * @param value - The value to check
 * @returns True if the value is a valid number
 */
export function isValidNumber(value: unknown): value is number {
  return value !== null && 
         value !== undefined && 
         typeof value === 'number' &&
         !Number.isNaN(value);
}

/**
 * Type guard to check if a value is a valid string
 * 
 * @param value - The value to check
 * @returns True if the value is a valid string
 */
export function isValidString(value: unknown): value is string {
  return value !== null && 
         value !== undefined && 
         typeof value === 'string';
}

/**
 * Type guard to check if a value is a valid array
 * 
 * @param value - The value to check
 * @returns True if the value is a valid array
 */
export function isValidArray(value: unknown): value is Array<unknown> {
  return value !== null && 
         value !== undefined && 
         Array.isArray(value);
}

/**
 * Type guard to check if a value is a valid object
 * 
 * @param value - The value to check
 * @returns True if the value is a valid object
 */
export function isValidObject(value: unknown): value is Record<string, unknown> {
  return value !== null && 
         value !== undefined && 
         typeof value === 'object' &&
         !Array.isArray(value);
}

/**
 * Type guard to check if a value has a specific property
 * 
 * @param value - The object to check
 * @param propertyName - The property name to check
 * @returns True if the object has the property
 */
export function hasProperty<K extends string>(
  value: unknown, 
  propertyName: K
): value is { [P in K]: unknown } {
  return isValidObject(value) && propertyName in value;
}

/**
 * Type guard to check if a value has a property of a specific type
 * 
 * @param value - The object to check
 * @param propertyName - The property name to check
 * @param typeGuard - Type guard function to check the property type
 * @returns True if the object has the property of the expected type
 */
export function hasPropertyOfType<K extends string, T>(
  value: unknown,
  propertyName: K,
  typeGuard: (v: unknown) => v is T
): value is { [P in K]: T } {
  return hasProperty(value, propertyName) && typeGuard(value[propertyName]);
}