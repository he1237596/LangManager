const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://fkxdfsrloccbxtdnsxjn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZreGRmc3Jsb2NjYnh0ZG5zeGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDY1MDQsImV4cCI6MjA5MTEyMjUwNH0.RMRQCx_GI2FoCuf9f4nNPRxv8QzdH9CZsroRqkccSho'
);

(async () => {
  // Check profiles
  const { data: profiles } = await sb.from('profiles').select('*');
  console.log('=== Profiles ===');
  console.log(JSON.stringify(profiles, null, 2));

  // Check roles
  const { data: roles } = await sb.from('roles').select('*');
  console.log('\n=== Roles ===');
  console.log(JSON.stringify(roles, null, 2));
})();
