async function checkVercel() {
  console.log('Checking Vercel production deployment...');
  const baseUrl = 'https://diklat-pim-prioritas-jalan-hss.vercel.app';
  
  // Wait 15 seconds to allow Vercel build to finalize
  console.log('Waiting 15 seconds for Vercel deployment...');
  await new Promise(r => setTimeout(r, 15000));
  
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      console.log(`Attempt ${attempt}: querying production endpoints...`);
      const resDemo = await fetch(`${baseUrl}/api/roads/HSS-KAB-001/demographics`);
      const demoData = await resDemo.json();
      
      const resSeg = await fetch(`${baseUrl}/api/roads/HSS-KAB-001/segments`);
      const segData = await resSeg.json();
      
      console.log('Production Demographics for HSS-KAB-001:', {
        status: resDemo.status,
        metric_label: demoData.metric_label,
        total_households: demoData.total_households,
        villages_count: demoData.villages_count
      });
      
      console.log('Production DD1 Segments for HSS-KAB-001:', {
        status: resSeg.status,
        total_segments: segData.total_segments,
        total_length_m: segData.total_length_m,
        condition_standard: segData.condition_standard
      });

      const resRoads = await fetch(`${baseUrl}/api/roads?mode=OPERATIONAL_2025`);
      const roadsData = await resRoads.json();
      const top1 = roadsData.roads ? roadsData.roads[0] : null;
      console.log('Production Rank #1 Road:', {
        road_key: top1?.road_key,
        composite_score: top1?.composite_score,
        tier: top1?.tier
      });
      
      if (
        resDemo.status === 200 &&
        demoData.total_households === 4566 &&
        resSeg.status === 200 &&
        segData.total_segments === 6 &&
        top1?.road_key === 'HSS-KAB-025'
      ) {
        console.log('>>> PRODUCTION DEPLOYMENT VERIFIED SUCCESSFULLY! <<<');
        return;
      }
    } catch (e) {
      console.log('Poll attempt error:', e.message);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error('Production verification timed out or failed');
}

checkVercel().catch(err => {
  console.error(err);
  process.exit(1);
});
