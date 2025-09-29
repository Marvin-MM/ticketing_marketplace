import nodemailer from 'nodemailer';
import config from '../../config/index.js';
import logger from '../../config/logger.js';

// Create transporter
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

/**
 * Send welcome email to new seller
 */
export const sendWelcomeEmail = async (userData) => {
  const { email, firstName, lastName, businessName, type } = userData;

  let subject, htmlContent;

  if (type === 'MANAGER') {
    subject = 'Welcome to the Validation Team';
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to the Team</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { background: #374151; color: white; padding: 20px; text-align: center; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${config.app.name}</h1>
            <h2>Welcome to the Validation Team!</h2>
          </div>
          <div class="content">
            <h3>Hello ${firstName},</h3>
            <p>You've been added as a validation manager. You can now scan and validate tickets using our validation app.</p>
            
            <p><strong>Your Login Credentials:</strong></p>
            <ul>
              <li>Email: ${email}</li>
              <li>Password: Use the password provided by your administrator</li>
            </ul>
            
            <p>Please keep your login credentials secure and don't share them with others.</p>
            
            <p>If you have any questions, please contact your administrator or our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ${config.app.name}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  } else {
    // Seller welcome email
    subject = 'Welcome to the Ticketing Marketplace - Your Application is Approved!';
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to ${config.app.name}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { background: #374151; color: white; padding: 20px; text-align: center; }
          .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; }
          .highlight { background: #dbeafe; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${config.app.name}</h1>
            <h2>Welcome to Our Platform!</h2>
          </div>
          <div class="content">
            <h3>Congratulations ${firstName} ${lastName}!</h3>
            <p>Your seller application for <strong>${businessName}</strong> has been approved! You can now start creating campaigns and selling tickets on our platform.</p>
            
            <div class="highlight">
              <h4>🎉 What you can do now:</h4>
              <ul>
                <li>Create and manage ticket campaigns</li>
                <li>Set flexible ticket types and pricing</li>
                <li>Track sales and analytics</li>
                <li>Manage your earnings and withdrawals</li>
                <li>Add validation managers for your events</li>
              </ul>
            </div>
            
            <p style="text-align: center;">
              <a href="${config.app.url}" class="button">Get Started</a>
            </p>
            
            <p>If you need help getting started, check out our documentation or contact our support team.</p>
            
            <p>Welcome aboard!</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 ${config.app.name}. All rights reserved.</p>
            <p>Support: support@ticketingmarketplace.com</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  try {
    await transporter.sendMail({
      from: config.email.from,
      to: email,
      subject,
      html: htmlContent,
    });

    logger.info('Welcome email sent successfully', { email, type });
  } catch (error) {
    logger.error('Failed to send welcome email:', error);
    throw error;
  }
};

/**
 * Send booking confirmation email
 */
export const sendBookingConfirmationEmail = async (bookingData) => {
  const {
    customerEmail,
    customerName,
    bookingRef,
    eventTitle,
    eventDate,
    ticketCount,
    bookingId,
  } = bookingData;

  const subject = `Booking Confirmed - ${eventTitle}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Booking Confirmation</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #059669; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { background: #374151; color: white; padding: 20px; text-align: center; }
        .booking-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .success-icon { font-size: 48px; color: #059669; text-align: center; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${config.app.name}</h1>
          <div class="success-icon">✅</div>
          <h2>Booking Confirmed!</h2>
        </div>
        <div class="content">
          <h3>Hello ${customerName},</h3>
          <p>Great news! Your booking has been confirmed. Your tickets are ready!</p>
          
          <div class="booking-details">
            <h4>Booking Details:</h4>
            <ul>
              <li><strong>Event:</strong> ${eventTitle}</li>
              <li><strong>Date:</strong> ${new Date(eventDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}</li>
              <li><strong>Booking Reference:</strong> ${bookingRef}</li>
              <li><strong>Number of Tickets:</strong> ${ticketCount}</li>
            </ul>
          </div>
          
          <p><strong>Your tickets are being generated and will be available in your account shortly.</strong></p>
          
          <p>You can view and download your tickets from your dashboard. Make sure to have them ready (either printed or on your phone) when you arrive at the venue.</p>
          
          <p><strong>Important:</strong></p>
          <ul>
            <li>Arrive early to avoid queues</li>
            <li>Bring a valid ID for verification</li>
            <li>Check venue policies and restrictions</li>
          </ul>
          
          <p>Have a great time at the event!</p>
        </div>
        <div class="footer">
          <p>&copy; 2024 ${config.app.name}. All rights reserved.</p>
          <p>Support: support@ticketingmarketplace.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: config.email.from,
      to: customerEmail,
      subject,
      html: htmlContent,
    });

    logger.info('Booking confirmation email sent', { customerEmail, bookingRef });
  } catch (error) {
    logger.error('Failed to send booking confirmation email:', error);
    throw error;
  }
};

/**
 * Send payment notification email
 */
export const sendPaymentNotificationEmail = async (paymentData) => {
  const {
    customerEmail,
    customerName,
    amount,
    paymentRef,
    status,
    eventTitle,
  } = paymentData;

  const isSuccess = status === 'SUCCESS';
  const subject = isSuccess 
    ? `Payment Successful - ${eventTitle}`
    : `Payment ${status} - ${eventTitle}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Payment ${status}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${isSuccess ? '#059669' : '#dc2626'}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { background: #374151; color: white; padding: 20px; text-align: center; }
        .payment-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${config.app.name}</h1>
          <h2>Payment ${status}</h2>
        </div>
        <div class="content">
          <h3>Hello ${customerName},</h3>
          ${isSuccess ? 
            '<p>Your payment has been processed successfully!</p>' : 
            '<p>There was an issue with your payment. Please try again or contact support.</p>'
          }
          
          <div class="payment-details">
            <h4>Payment Details:</h4>
            <ul>
              <li><strong>Event:</strong> ${eventTitle}</li>
              <li><strong>Amount:</strong> $${amount}</li>
              <li><strong>Payment Reference:</strong> ${paymentRef}</li>
              <li><strong>Status:</strong> ${status}</li>
              <li><strong>Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
          </div>
          
          ${isSuccess ? 
            '<p>Your booking is now confirmed and your tickets will be available shortly.</p>' : 
            '<p>If you continue to experience issues, please contact our support team.</p>'
          }
        </div>
        <div class="footer">
          <p>&copy; 2024 ${config.app.name}. All rights reserved.</p>
          <p>Support: support@ticketingmarketplace.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: config.email.from,
      to: customerEmail,
      subject,
      html: htmlContent,
    });

    logger.info('Payment notification email sent', { customerEmail, paymentRef, status });
  } catch (error) {
    logger.error('Failed to send payment notification email:', error);
    throw error;
  }
};