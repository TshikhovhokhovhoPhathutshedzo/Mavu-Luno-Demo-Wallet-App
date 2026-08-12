import pool from './auth/db.js';

async function checkTable() {
  try {
    console.log('Checking user_face_embeddings table structure...');
    
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'user_face_embeddings'
      ORDER BY ordinal_position
    `);
    
    console.log('Table columns:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });
    
    // Check if table has any data
    const countResult = await pool.query('SELECT COUNT(*) FROM user_face_embeddings');
    console.log(`\nTotal records in table: ${countResult.rows[0].count}`);
    
  } catch (error) {
    console.error('Error checking table:', error.message);
  } finally {
    await pool.end();
  }
}

checkTable();

