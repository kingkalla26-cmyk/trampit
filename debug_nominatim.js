const dest = 'יד רמבם, ישראל';
fetch(
  `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(dest)}&format=json&limit=1&countrycodes=il&addressdetails=1`,
  { headers: { 'User-Agent': 'TrampitApp/1.0 trempit01@gmail.com' } }
)
  .then(r => r.json())
  .then(d => {
    if (!d[0]) { console.log('לא נמצא'); return; }
    console.log('lat:', d[0].lat, '  lon:', d[0].lon);
    console.log('display_name:', d[0].display_name);
    console.log('address:', JSON.stringify(d[0].address, null, 2));
  });
