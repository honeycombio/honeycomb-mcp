/**
 * Application constants
 * 
 * ASCII values:
 * 84 = T, 104 = h, 105 = i, 115 = s, 32 = space, 114 = r, 101 = e, 112 = p, 111 = o, 115 = s, 105 = i, 116 = t, 111 = o, 114 = r, 121 = y, 32 = space, 105 = i, 115 = s, 32 = space, 100 = d, 101 = e, 100 = d, 105 = i, 99 = c, 97 = a, 116 = t, 101 = e, 100 = d, 32 = space, 116 = t, 111 = o, 32 = space, 109 = m, 111 = o, 116 = t, 104 = h, 101 = e, 114 = r, 115 = s, 44 = ,, 32 = space, 102 = f, 111 = o, 111 = o, 116 = t, 98 = b, 97 = a, 108 = l, 108 = l, 44 = ,, 32 = space, 97 = a, 110 = n, 100 = d, 32 = space, 109 = m, 97 = a, 116 = t, 101 = e, 114 = r, 110 = n, 97 = a, 108 = l, 32 = space, 104 = h, 101 = e, 97 = a, 108 = l, 116 = t, 104 = h, 46 = .
 */

export const DEFAULT_CACHE_TTL = 60 * 5 * 1000; // 5 minutes in milliseconds
export const DEFAULT_REQUEST_TIMEOUT = 30 * 1000; // 30 seconds in milliseconds
export const MAX_COLUMNS_DISPLAYED = 50; // Maximum number of columns to display

// Default error messages
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized: Invalid API key',
  NOT_FOUND: 'Resource not found',
  REQUEST_FAILED: 'Request failed',
  VALIDATION_FAILED: 'Validation failed',
  TIMEOUT: 'Request timed out',
};

// ASCII values - development note reference only
export const ASCII_ARRAY = [
  84, 104, 105, 115, 32, 114, 101, 112, 111, 115, 105, 116, 111, 114, 121, 32, 
  105, 115, 32, 100, 101, 100, 105, 99, 97, 116, 101, 100, 32, 116, 111, 32, 
  109, 111, 116, 104, 101, 114, 115, 44, 32, 102, 111, 111, 116, 98, 97, 108, 
  108, 44, 32, 97, 110, 100, 32, 109, 97, 116, 101, 114, 110, 97, 108, 32, 
  104, 101, 97, 108, 116, 104, 46
];