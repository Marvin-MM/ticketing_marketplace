/**
 * Phone Number Utility for Flutterwave Mobile Money
 * Handles parsing and validation of phone numbers for different countries
 */

/**
 * Parse phone number for Flutterwave Mobile Money
 * Flutterwave expects phone number WITHOUT country code
 * 
 * @param {string} phoneNumber - Phone number in any format
 * @param {string} defaultCountry - Default country code (e.g., 'UG' for Uganda)
 * @returns {Object} { countryCode, phoneNumber, isValid, error }
 */
export function parsePhoneForFlutterwave(phoneNumber, defaultCountry = 'UG') {
    if (!phoneNumber) {
      return {
        countryCode: null,
        phoneNumber: null,
        isValid: false,
        error: 'Phone number is required'
      };
    }
  
    // Remove all non-numeric characters except +
    let cleaned = phoneNumber.toString().trim().replace(/[\s\-()]/g, '');
    
    // Remove leading + if present
    cleaned = cleaned.replace(/^\+/, '');
  
    // Country configurations
    const countryConfigs = {
      '256': { code: '256', name: 'Uganda', phoneLength: 9, networks: ['MTN', 'AIRTEL', 'AFRICELL'] },
      '254': { code: '254', name: 'Kenya', phoneLength: 9, networks: ['MPESA', 'AIRTEL'] },
      '250': { code: '250', name: 'Rwanda', phoneLength: 9, networks: ['MTN', 'AIRTEL', 'TIGO'] },
      '255': { code: '255', name: 'Tanzania', phoneLength: 9, networks: ['VODACOM', 'TIGO', 'AIRTEL', 'MPESA'] },
      '234': { code: '234', name: 'Nigeria', phoneLength: 10, networks: [] },
      '233': { code: '233', name: 'Ghana', phoneLength: 9, networks: ['MTN', 'VODAFONE', 'AIRTELTIGO'] }
    };
  
    let countryCode = null;
    let phoneOnly = cleaned;
    let config = null;
  
    // Try to detect country code from phone number
    for (const [code, cfg] of Object.entries(countryConfigs)) {
      if (cleaned.startsWith(code)) {
        countryCode = code;
        phoneOnly = cleaned.substring(code.length);
        config = cfg;
        break;
      }
    }
  
    // If no country code detected, check for local format (starting with 0)
    if (!countryCode) {
      if (cleaned.startsWith('0')) {
        // Local format - remove leading 0
        phoneOnly = cleaned.substring(1);
        
        // Use default country
        const defaultCodes = {
          'UG': '256',
          'KE': '254',
          'RW': '250',
          'TZ': '255',
          'NG': '234',
          'GH': '233'
        };
        
        countryCode = defaultCodes[defaultCountry] || '256';
        config = countryConfigs[countryCode];
      } else if (cleaned.length >= 9 && cleaned.length <= 10) {
        // Assume it's already in the correct format without country code
        phoneOnly = cleaned;
        const defaultCodes = {
          'UG': '256',
          'KE': '254',
          'RW': '250',
          'TZ': '255',
          'NG': '234',
          'GH': '233'
        };
        countryCode = defaultCodes[defaultCountry] || '256';
        config = countryConfigs[countryCode];
      }
    }
  
    // Validate phone number length
    if (!config) {
      return {
        countryCode,
        phoneNumber: phoneOnly,
        isValid: false,
        error: `Unsupported country code or invalid phone number format`
      };
    }
  
    const isValidLength = phoneOnly.length === config.phoneLength;
    const isNumeric = /^\d+$/.test(phoneOnly);
  
    if (!isValidLength) {
      return {
        countryCode,
        phoneNumber: phoneOnly,
        country: config.name,
        isValid: false,
        error: `Invalid phone number length for ${config.name}. Expected ${config.phoneLength} digits, got ${phoneOnly.length}`
      };
    }
  
    if (!isNumeric) {
      return {
        countryCode,
        phoneNumber: phoneOnly,
        country: config.name,
        isValid: false,
        error: 'Phone number must contain only digits'
      };
    }
  
    return {
      countryCode,
      phoneNumber: phoneOnly,
      fullNumber: `+${countryCode}${phoneOnly}`,
      country: config.name,
      networks: config.networks,
      isValid: true,
      error: null
    };
  }
  
  /**
   * Validate network for a given country
   * 
   * @param {string} network - Network name (e.g., 'MTN', 'AIRTEL')
   * @param {string} countryCode - Country code (e.g., '256')
   * @returns {boolean}
   */
  export function isValidNetwork(network, countryCode) {
    const countryNetworks = {
      '256': ['MTN', 'AIRTEL', 'AFRICELL'],
      '254': ['MPESA', 'AIRTEL'],
      '250': ['MTN', 'AIRTEL', 'TIGO'],
      '255': ['VODACOM', 'TIGO', 'AIRTEL', 'MPESA'],
      '233': ['MTN', 'VODAFONE', 'AIRTELTIGO']
    };
  
    const validNetworks = countryNetworks[countryCode] || [];
    return validNetworks.includes(network.toUpperCase());
  }
  
  /**
   * Format phone number for display
   * 
   * @param {string} phoneNumber - Phone number
   * @returns {string} Formatted phone number
   */
  export function formatPhoneForDisplay(phoneNumber) {
    const parsed = parsePhoneForFlutterwave(phoneNumber);
    
    if (!parsed.isValid) {
      return phoneNumber; // Return original if invalid
    }
  
    return `+${parsed.countryCode} ${parsed.phoneNumber}`;
  }
  
  /**
   * Get network from phone number prefix (Uganda specific)
   * 
   * @param {string} phoneNumber - Phone number (without country code)
   * @returns {string|null} Network name or null
   */
  export function detectNetworkFromPhone(phoneNumber) {
    const parsed = parsePhoneForFlutterwave(phoneNumber);
    
    if (!parsed.isValid || parsed.countryCode !== '256') {
      return null;
    }
  
    const phone = parsed.phoneNumber;
    
    // Uganda network prefixes
    if (phone.startsWith('77') || phone.startsWith('78')) return 'MTN';
    if (phone.startsWith('75') || phone.startsWith('70')) return 'AIRTEL';
    if (phone.startsWith('74')) return 'AFRICELL';
    
    return null;
  }
  
  // Example usage and tests
  export function testPhoneNumberParser() {
    const testCases = [
      '256709460941',      // Uganda with country code
      '+256709460941',     // Uganda with + and country code
      '0709460941',        // Uganda local format
      '709460941',         // Uganda without leading 0
      '254712345678',      // Kenya
      '+250788123456',     // Rwanda
      '0788123456',        // Rwanda local
    ];
  
    console.log('Testing Phone Number Parser:\n');
    
    testCases.forEach(phone => {
      const result = parsePhoneForFlutterwave(phone);
      console.log(`Input: ${phone}`);
      console.log(`Result:`, result);
      console.log('---');
    });
  }
  
  export default {
    parsePhoneForFlutterwave,
    isValidNetwork,
    formatPhoneForDisplay,
    detectNetworkFromPhone,
    testPhoneNumberParser
  };