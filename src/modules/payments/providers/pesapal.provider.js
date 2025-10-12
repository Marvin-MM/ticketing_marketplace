import config from '../../../config/index.js';
import logger from '../../../config/logger.js';

class PesapalProvider {
  constructor() {
    this.config = {
      consumerKey: config.pesapal.consumerKey,
      consumerSecret: config.pesapal.consumerSecret,
      environment: config.pesapal.environment || 'sandbox',
    };
    this.baseUrl = this.config.environment === 'production'
      ? 'https://pay.pesapal.com/v3'
      : 'https://cybqa.pesapal.com/pesapalv3';
    
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.ipnId = null;

    if (!this.config.consumerKey || !this.config.consumerSecret) {
      logger.error("CRITICAL: Pesapal credentials are not configured.");
    }
  }

  async #getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/Auth/RequestToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          consumer_key: this.config.consumerKey,
          consumer_secret: this.config.consumerSecret,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(`Failed to get access token: ${data.error?.message}`);
      }
      this.accessToken = data.token;
      this.tokenExpiry = Date.parse(data.expiryDate) - (5 * 60 * 1000); // Refresh 5 mins before expiry
      return this.accessToken;
    } catch (error) {
      logger.error('Error getting Pesapal access token:', error);
      throw new Error('Failed to authenticate with payment gateway');
    }
  }

  async #getIpnId() {
    if (this.ipnId) {
      return this.ipnId;
    }

    try {
      const token = await this.#getAccessToken();
      const ipnUrlToRegister = `${config.app.url}/api/v1/payments/webhook`;
      const response = await fetch(`${this.baseUrl}/api/URLSetup/RegisterIPN`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: ipnUrlToRegister,
          ipn_notification_type: 'GET', // Pesapal IPNs are typically GET requests
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ipn_id) {
        throw new Error(`IPN registration failed: ${data.error?.message}`);
      }
      this.ipnId = data.ipn_id;
      logger.info(`Successfully registered Pesapal IPN URL with ID: ${this.ipnId}`);
      return this.ipnId;
    } catch (error) {
      logger.error('Error getting/registering IPN ID:', error);
      throw new Error('Failed to configure payment notifications');
    }
  }

  async submitOrderRequest(paymentData) {
    try {
      const token = await this.#getAccessToken();
      const notification_id = await this.#getIpnId();

      const payload = { ...paymentData, notification_id };
      
      const response = await fetch(`${this.baseUrl}/api/Transactions/SubmitOrderRequest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error?.message || 'Payment request failed');
      }
      return result;
    } catch (error) {
      logger.error('Pesapal payment submission error:', error);
      throw new Error(`Payment processing failed: ${error.message}`);
    }
  }

  async getTransactionStatus(orderTrackingId) {
    try {
      const token = await this.#getAccessToken();
      const response = await fetch(
        `${this.baseUrl}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
        {
          method: 'GET',
          headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` },
        }
      );
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(`Status check error: ${result.error?.message}`);
      }
      return result;
    } catch (error) {
      logger.error('Error getting Pesapal transaction status:', error);
      throw new Error('Failed to check payment status');
    }
  }
}

export default new PesapalProvider();