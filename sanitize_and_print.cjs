const http = require('http');
const fs = require('fs');

http.get('http://localhost:3001/api/betting/fixtures/1435547/analysis', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      let obj = JSON.parse(d);

      function cleanStr(s){
        if (typeof s !== 'string') return s;
        return s.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
      }

      function normalizeKey(k){
        return String(k)
          .replace(/\r|\n/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/probabillity/gi, 'probability')
          .replace(/probabilty/gi, 'probability')
          .replace(/probabil lity/gi, 'probability')
          .replace(/probabil[^a-z]*lity/gi, 'probability')
          .replace(/confidence\s*:/gi, 'confidence')
          .trim();
      }

      function clean(obj){
        if (Array.isArray(obj)) return obj.map(clean);
        if (obj && typeof obj === 'object'){
          const out = {};
          for (const k of Object.keys(obj)){
            const nk = normalizeKey(k);
            out[nk] = clean(obj[k]);
          }
          return out;
        }
        if (typeof obj === 'string') return cleanStr(obj);
        return obj;
      }

      const cleaned = clean(obj);

      // Ensure bettingTips shape consistency if present
      if (cleaned && cleaned.data && cleaned.data.aiAnalysis && Array.isArray(cleaned.data.aiAnalysis.bettingTips)){
        cleaned.data.aiAnalysis.bettingTips = cleaned.data.aiAnalysis.bettingTips.map((t, i) => {
          const tip = {};
          tip.type = t.type || t.Type || String((t[0] || `tip_${i}`));
          // handle several possible misspelled keys
          const prob = t.probability ?? t.probabilty ?? t.probabillity ?? t.probabil_lity ?? t['probabil lity'] ?? null;
          tip.probability = (prob === null || prob === undefined || prob === '') ? null : (Number.isFinite(Number(prob)) ? Math.round(Number(prob)) : null);
          tip.reasoning = t.reasoning ?? t.Reasoning ?? t.reason ?? '';
          // sanitize strings
          tip.type = typeof tip.type === 'string' ? tip.type.replace(/\s*\n\s*/g,' ').trim() : String(tip.type);
          tip.reasoning = typeof tip.reasoning === 'string' ? tip.reasoning.replace(/\s*\n\s*/g,' ').trim() : String(tip.reasoning);
          return tip;
        });
      }

      // Rebalance probabilities if needed (simple normalization to integers summing to 100)
      try {
        const probs = cleaned?.data?.aiAnalysis?.bettingTips?.map(t => (typeof t.probability === 'number' ? t.probability : 0));
        if (Array.isArray(probs) && probs.length > 0) {
          const total = probs.reduce((s, v) => s + v, 0) || 0;
          if (total > 0) {
            // scale to sum 100 while keeping integers
            const scaled = probs.map(p => Math.floor((p / total) * 100));
            let remainder = 100 - scaled.reduce((s, v) => s + v, 0);
            // distribute remainder to largest entries
            const idxs = scaled.map((v,i) => ({v, i})).sort((a,b) => probs[b.i] - probs[a.i]);
            let j = 0;
            while (remainder > 0 && j < idxs.length) {
              scaled[idxs[j].i] += 1;
              remainder -= 1;
              j = (j + 1) % idxs.length;
            }
            // write back
            cleaned.data.aiAnalysis.bettingTips = cleaned.data.aiAnalysis.bettingTips.map((t, i) => {
              return Object.assign({}, t, { probability: scaled[i] });
            });
          }
        }
      } catch(e) {
        // ignore normalization errors
      }

      // Write cleaned output for inspection (non-destructive)
      try{
        fs.mkdirSync('tmp', { recursive: true });
        fs.writeFileSync('tmp/analysis_1435547_cleaned.json', JSON.stringify(cleaned, null, 2), 'utf8');
      }catch(e){
        // ignore write errors but still print cleaned
      }

      console.log(JSON.stringify(cleaned, null, 2));
      process.exit(0);
    } catch (e) {
      console.error('PARSE_ERROR', e && e.message ? e.message : String(e));
      process.exit(1);
    }
  });
}).on('error', e => {
  console.error('HTTP_ERROR', e && e.message ? e.message : String(e));
  process.exit(1);
});
