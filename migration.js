// migrate-data-only.js
import { createClient } from '@supabase/supabase-js';
import pkg from 'pg';
const { Client } = pkg;

const config = {
  local: {
    host: 'localhost',
    port: 5432,
    database: 'ticketing_marketplace',
    user: 'postgres',
    password: 'postgres'
  },
  supabase: {
    url: 'https://bcfpvrdjooxjfalmmpfm.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjZnB2cmRqb294amZhbG1tcGZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwMTY4MTAsImV4cCI6MjA3NTU5MjgxMH0.e74AlyJDPufmfmIiLL7OKqHfcbfuDNhSEj-5pzOoYF8'
  }
};

const localDB = new Client(config.local);
const supabase = createClient(config.supabase.url, config.supabase.key);

// Define migration order to respect foreign key dependencies
const MIGRATION_ORDER = [
  'users',                    // Base table with no dependencies
  'seller_applications',      // Depends on users
  'ticket_campaigns',         // Depends on users (sellerId)
  'managers',                 // Depends on users (sellerId)
  'finances',                 // Depends on users (sellerId)
  'bookings',                 // Depends on users (customerId) and ticket_campaigns
  'campaign_analytics',       // Depends on ticket_campaigns
  'audit_logs',               // Depends on users
  'tickets',                  // Depends on bookings and ticket_campaigns
  'ticket_validations',       // Depends on tickets
  'payments',                 // Depends on bookings
  'transactions',             // Depends on users
  'withdrawal_methods',       // Depends on users
  'withdrawals',              // Depends on users and withdrawal_methods
  'notifications',            // Depends on users
  '_ManagerCampaigns'         // Junction table, depends on managers and ticket_campaigns
];

// Handle case-sensitive table names
function getTableName(tableName) {
  // Handle the special case for _ManagerCampaigns
  if (tableName === '_ManagerCampaigns') {
    return '_ManagerCampaigns'; // Keep as-is for local query
  }
  return tableName;
}

function getSupabaseTableName(tableName) {
  // Convert to lowercase for Supabase (except for the special case)
  if (tableName === '_ManagerCampaigns') {
    return '_ManagerCampaigns'; // Keep as-is if that's the actual name in Supabase
  }
  return tableName.toLowerCase();
}

async function getTableData(tableName) {
  const actualTableName = getTableName(tableName);
  console.log(`  Reading data from ${actualTableName}...`);
  
  try {
    const result = await localDB.query(`SELECT * FROM "${actualTableName}"`);
    return result.rows;
  } catch (error) {
    // Try without quotes if the first attempt fails
    const result = await localDB.query(`SELECT * FROM ${actualTableName}`);
    return result.rows;
  }
}

async function insertTableData(tableName, data) {
  if (data.length === 0) {
    console.log(`  No data to migrate for ${tableName}`);
    return { success: 0, error: 0, total: 0 };
  }

  const supabaseTableName = getSupabaseTableName(tableName);
  const batchSize = 50;
  let successCount = 0;
  let errorCount = 0;
  
  console.log(`  Inserting ${data.length} rows into ${supabaseTableName}...`);
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    try {
      const { error } = await supabase
        .from(supabaseTableName)
        .insert(batch);
      
      if (error) {
        console.error(`    ❌ Batch error for ${supabaseTableName}:`, error.message);
        errorCount += batch.length;
        
        // If it's a foreign key error, log which foreign key is causing issues
        if (error.message.includes('violates foreign key constraint')) {
          const fkMatch = error.message.match(/constraint "([^"]+)"/);
          if (fkMatch) {
            console.error(`    🔗 Foreign key constraint: ${fkMatch[1]}`);
          }
        }
      } else {
        successCount += batch.length;
        console.log(`    ✅ Progress: ${successCount}/${data.length} rows`);
      }
    } catch (error) {
      console.error(`    ❌ Batch failed for ${supabaseTableName}:`, error.message);
      errorCount += batch.length;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return { success: successCount, error: errorCount, total: data.length };
}

async function disableTriggers() {
  console.log('🔧 Temporarily disabling triggers...');
  try {
    // Disable foreign key constraints temporarily
    await supabase.rpc('exec_sql', { sql: 'SET session_replication_role = replica;' });
    console.log('  ✅ Triggers disabled');
  } catch (error) {
    console.log('  ⚠️  Could not disable triggers (this is normal for some setups)');
  }
}

async function enableTriggers() {
  console.log('🔧 Re-enabling triggers...');
  try {
    await supabase.rpc('exec_sql', { sql: 'SET session_replication_role = DEFAULT;' });
    console.log('  ✅ Triggers re-enabled');
  } catch (error) {
    console.log('  ⚠️  Could not re-enable triggers');
  }
}

async function checkSupabaseTables() {
  console.log('\n🔍 Checking Supabase table existence...');
  const existingTables = [];
  const missingTables = [];
  
  for (const tableName of MIGRATION_ORDER) {
    const supabaseTableName = getSupabaseTableName(tableName);
    try {
      // Try to select one row to check if table exists
      const { error } = await supabase
        .from(supabaseTableName)
        .select('*')
        .limit(1);
      
      if (error && error.code === '42P01') { // Table doesn't exist
        missingTables.push(supabaseTableName);
      } else {
        existingTables.push(supabaseTableName);
      }
    } catch (error) {
      missingTables.push(supabaseTableName);
    }
  }
  
  console.log(`  ✅ Existing tables: ${existingTables.length}`);
  console.log(`  ❌ Missing tables: ${missingTables.length}`);
  if (missingTables.length > 0) {
    console.log('  Missing tables:', missingTables);
  }
  
  return { existingTables, missingTables };
}

async function migrateData() {
  try {
    console.log('🚀 Starting database migration...');
    console.log(`📊 Source: ${config.local.host}:${config.local.port}/${config.local.database}`);
    console.log(`🎯 Target: ${config.supabase.url}`);
    
    await localDB.connect();
    console.log('✅ Connected to local database');

    // Check Supabase tables
    const { missingTables } = await checkSupabaseTables();
    if (missingTables.length > 0) {
      console.log('\n⚠️  Some tables are missing in Supabase. Make sure your schema is properly set up.');
      console.log('💡 You may need to run your database schema migrations first.');
    }

    // Disable triggers to avoid foreign key constraints during migration
    await disableTriggers();

    let totalMigrated = 0;
    let totalErrors = 0;

    console.log('\n📦 Migrating data in dependency order...');
    
    for (const tableName of MIGRATION_ORDER) {
      console.log(`\n📦 Migrating ${tableName}...`);
      
      try {
        const data = await getTableData(tableName);
        const result = await insertTableData(tableName, data);
        
        totalMigrated += result.success;
        totalErrors += result.error;
        
        if (result.error > 0) {
          console.log(`  ⚠️  ${tableName}: ${result.success} successful, ${result.error} failed`);
        } else {
          console.log(`  ✅ ${tableName}: ${result.success} rows migrated successfully`);
        }
      } catch (error) {
        console.error(`  ❌ Failed to migrate ${tableName}:`, error.message);
        totalErrors++;
      }
    }

    // Re-enable triggers
    await enableTriggers();

    console.log('\n🎉 Migration Summary:');
    console.log(`   ✅ Successfully migrated: ${totalMigrated} rows`);
    console.log(`   ❌ Errors: ${totalErrors} rows`);
    console.log(`   📊 Total tables processed: ${MIGRATION_ORDER.length}`);

    if (totalErrors > 0) {
      console.log('\n💡 Tips for resolving errors:');
      console.log('   1. Make sure all tables exist in Supabase with correct schema');
      console.log('   2. Check that foreign key relationships match between databases');
      console.log('   3. Verify that referenced records exist in parent tables');
      console.log('   4. Consider truncating Supabase tables and starting fresh');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    if (localDB) {
      await localDB.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migration
migrateData();