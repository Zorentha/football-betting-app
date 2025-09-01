import { openaiAnalysisService } from '../src/services/openaiAnalysisService.js';

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function assert(cond, msg) {
  if (!cond) {
    console.error('ASSERT FAILED:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

function sum(arr) { return arr.reduce((s,x)=>s+(Number(x)||0),0); }

async function run() {
  console.log('Running unit tests for validateAndNormalizeAIAnalysis...');

  // Test 1: well-formed input should remain consistent and sums should be 100
  const in1 = {
    probabilities: { homeWin: 35, draw: 36, awayWin: 29 },
    predictedScore: { home: 2, away: 2 },
    confidence: 'medium',
    bettingTips: [
      { type: 'A', probability: 30, reasoning: 'r1' },
      { type: 'B', probability: 30, reasoning: 'r2' },
      { type: 'C', probability: 40, reasoning: 'r3' }
    ]
  };
  const out1 = openaiAnalysisService.validateAndNormalizeAIAnalysis(in1);
  assert(out1 && out1.probabilities, 'out1.probabilities exists');
  assert(sum([out1.probabilities.homeWin, out1.probabilities.draw, out1.probabilities.awayWin]) === 100, '3-way sums to 100');
  assert(Array.isArray(out1.bettingTips) && out1.bettingTips.length === 3, '3 tips preserved');
  assert(sum(out1.bettingTips.map(t => t.probability)) === 100, 'tip probabilities scaled to 100');

  // Test 2: tips missing probabilities -> equal split
  const in2 = {
    probabilities: { homeWin: 20, draw: 20, awayWin: 60 },
    predictedScore: { home: 1, away: 0 },
    bettingTips: [
      { type: 'X', reasoning: 'x' },
      { type: 'Y', reasoning: 'y' },
      { type: 'Z', reasoning: 'z' },
      { type: 'W', reasoning: 'w' }
    ]
  };
  const out2 = openaiAnalysisService.validateAndNormalizeAIAnalysis(in2);
  assert(Array.isArray(out2.bettingTips) && out2.bettingTips.length === 4, '4 tips present');
  const sum2 = sum(out2.bettingTips.map(t => t.probability));
  assert(sum2 === 100, `tips sum to 100 (got ${sum2})`);
  // ensure approx equal distribution (each ~25)
  out2.bettingTips.forEach(t => {
    assert(typeof t.probability === 'number', 'probability is number');
    assert(t.probability >= 24 && t.probability <= 26, `prob approx equal, got ${t.probability}`);
  });

  // Test 3: predictedScore is a draw -> draw probability should become highest
  const in3 = {
    probabilities: { homeWin: 50, draw: 10, awayWin: 40 },
    predictedScore: { home: 1, away: 1 },
    bettingTips: [{ type: 'T1', probability: 50 }, { type: 'T2', probability: 50 }]
  };
  const out3 = openaiAnalysisService.validateAndNormalizeAIAnalysis(in3);
  const p = out3.probabilities;
  assert(p.draw >= p.homeWin && p.draw >= p.awayWin, `draw is highest after normalization: ${JSON.stringify(p)}`);

  // Test 4: malformed tip keys and string probabilities should be parsed
  const in4 = {
    probabilities: { homeWin: 10, draw: 20, awayWin: 70 },
    predictedScore: { home: 0, away: 1 },
    bettingTips: [
      { type: 'M1', probabillity: '10', reasoning: 'ok' },
      { type: 'M2', probabilty: 20, Reasoning: 'ok2' },
      { type: 'M3', 'probabil lity': '70', reason: 'ok3' }
    ]
  };
  const out4 = openaiAnalysisService.validateAndNormalizeAIAnalysis(in4);
  assert(Array.isArray(out4.bettingTips) && out4.bettingTips.length === 3, '3 malformed tips parsed');
  out4.bettingTips.forEach(t => {
    assert(typeof t.probability === 'number' && !Number.isNaN(t.probability), `tip probability numeric (${t.type} -> ${t.probability})`);
  });
  const sum4 = sum(out4.bettingTips.map(t => t.probability));
  assert(sum4 === 100, `malformed tips scaled to 100 (got ${sum4})`);

  console.log('All unit tests passed for validateAndNormalizeAIAnalysis.');
}

run().catch(err => {
  console.error('Unit tests failed:', err && err.message ? err.message : err);
  process.exit(1);
});
