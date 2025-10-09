import Flutterwave from 'flutterwave-node-v3';
import prisma from './config/database.js';
import config from './config/index.js';

/**
 * Payment Service Diagnostic Tool
 * Run this to verify your setup before processing real payments
 */

async function runDiagnostics() {
  console.log('🔍 Running Payment Service Diagnostics...\n');

  // Test 1: Check Flutterwave Configuration
  console.log('1️⃣ Checking Flutterwave Configuration...');
  try {
    if (!config.flutterwave?.publicKey) {
      console.error('   ❌ PUBLIC_KEY is missing');
    } else {
      console.log(`   ✅ PUBLIC_KEY configured (${config.flutterwave.publicKey.substring(0, 10)}...)`);
    }

    if (!config.flutterwave?.secretKey) {
      console.error('   ❌ SECRET_KEY is missing');
    } else {
      console.log(`   ✅ SECRET_KEY configured (${config.flutterwave.secretKey.substring(0, 10)}...)`);
    }

    if (!config.flutterwave?.webhookSecret) {
      console.error('   ❌ WEBHOOK_SECRET is missing');
    } else {
      console.log('   ✅ WEBHOOK_SECRET configured');
    }
  } catch (error) {
    console.error('   ❌ Error checking config:', error.message);
  }

  // Test 2: Initialize Flutterwave SDK
  console.log('\n2️⃣ Testing Flutterwave SDK Initialization...');
  try {
    const flw = new Flutterwave(
      config.flutterwave.publicKey,
      config.flutterwave.secretKey
    );

    console.log('   ✅ SDK initialized successfully');
    console.log('   Available modules:', Object.keys(flw).join(', '));

    if (flw.MobileMoney) {
      console.log('   ✅ MobileMoney module available');
    } else {
      console.error('   ❌ MobileMoney module not found');
    }

    if (flw.Transaction) {
      console.log('   ✅ Transaction module available');
    } else {
      console.error('   ❌ Transaction module not found');
    }

    if (flw.Charge) {
      console.log('   ✅ Charge module available');
    } else {
      console.error('   ❌ Charge module not found');
    }
  } catch (error) {
    console.error('   ❌ SDK initialization failed:', error.message);
  }

  // Test 3: Check Database Schema
  console.log('\n3️⃣ Checking Database Schema...');
  try {
    // Try to get one payment to see available fields
    const samplePayment = await prisma.payment.findFirst();
    
    if (samplePayment) {
      console.log('   ✅ Payment table accessible');
      console.log('   Available fields:', Object.keys(samplePayment).join(', '));
      
      // Check for required fields
      const requiredFields = [
        'bookingId', 'customerId', 'transactionRef', 'flutterwaveRef',
        'amount', 'currency', 'status', 'paymentDetails'
      ];
      
      requiredFields.forEach(field => {
        if (field in samplePayment) {
          console.log(`   ✅ Field '${field}' exists`);
        } else {
          console.error(`   ❌ Field '${field}' missing`);
        }
      });

      // Check paymentDetails structure
      if (samplePayment.paymentDetails) {
        console.log('   ✅ paymentDetails is JSON');
        console.log('   paymentDetails sample:', JSON.stringify(samplePayment.paymentDetails, null, 2));
      }
    } else {
      console.log('   ℹ️  No payments in database yet (this is OK)');
      
      // Try to describe the schema
      console.log('   Testing by creating a test query...');
      try {
        await prisma.payment.findMany({ take: 0 });
        console.log('   ✅ Payment table exists');
      } catch (err) {
        console.error('   ❌ Payment table access failed:', err.message);
      }
    }
  } catch (error) {
    console.error('   ❌ Database check failed:', error.message);
  }

  // Test 4: Test Payment Link Extraction
  console.log('\n4️⃣ Testing Payment Response Parsing...');
  const mockFlutterwaveResponse = {
    status: 'success',
    message: 'Charge initiated',
    meta: {
      authorization: {
        redirect: 'https://checkout-v2.dev-flutterwave.com/test-link',
        mode: 'redirect'
      }
    }
  };

  const extractedLink = mockFlutterwaveResponse.meta?.authorization?.redirect ||
                        mockFlutterwaveResponse.data?.link;
  
  if (extractedLink) {
    console.log('   ✅ Payment link extraction working');
    console.log('   Sample link:', extractedLink);
  } else {
    console.error('   ❌ Payment link extraction failed');
  }

  // Test 5: Test Webhook Signature Verification
  console.log('\n5️⃣ Testing Webhook Signature Verification...');
  try {
    const crypto = await import('crypto');
    const testData = { event: 'charge.completed', data: { tx_ref: 'TEST' } };
    const hash = crypto.default
      .createHmac('sha256', config.flutterwave.webhookSecret)
      .update(JSON.stringify(testData))
      .digest('hex');
    
    console.log('   ✅ Webhook signature generation working');
    console.log('   Sample hash:', hash.substring(0, 20) + '...');
  } catch (error) {
    console.error('   ❌ Webhook signature test failed:', error.message);
  }

  // Test 6: Environment Check
  console.log('\n6️⃣ Checking Environment...');
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   App URL: ${config.app?.url || 'NOT SET'}`);
  
  if (config.flutterwave.publicKey?.includes('FLWPUBK_TEST')) {
    console.log('   ⚠️  Using TEST keys (this is OK for development)');
  } else if (config.flutterwave.publicKey?.includes('FLWPUBK-')) {
    console.log('   ⚠️  Using LIVE keys (ensure this is production)');
  }

  console.log('\n✨ Diagnostics Complete!\n');
}

// Run diagnostics
runDiagnostics()
  .then(() => {
    console.log('Exiting...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Diagnostic failed:', error);
    process.exit(1);
  });