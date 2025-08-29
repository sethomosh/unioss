import fetch from 'node-fetch';

const BASE = 'http://localhost:8000';

async function check(endpoint) {
  try {
    const res = await fetch(`${BASE}${endpoint}`);
    const data = await res.json();
    console.log(`✅ ${endpoint}:`, Array.isArray(data) ? data.length + ' items' : data);
  } catch (err) {
    console.error(`❌ ${endpoint}:`, err.message);
  }
}

(async () => {
  console.log('--- Backend Sanity Check ---');
  await check('/discovery/devices');
  await check('/performance');
  await check('/traffic');
  await check('/access/sessions');
  await check('/alerts');
  await check('/dashboard/metrics');
})();
