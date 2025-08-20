import fs from 'fs';
import path from 'path';
import { databaseService } from '../src/services/databaseService.js';

(async () => {
  try {
    const cwd = process.cwd();
    const fixtureId = 1435547;

    const annotatePath = path.join(cwd, 'tmp', 'annotate_strict_response_1435547.json');
    const fixturePath = path.join(cwd, 'tmp', 'fixture_1435547_after.json');

    if (!fs.existsSync(annotatePath)) {
      console.error(`Annotate file not found: ${annotatePath}`);
      process.exit(2);
    }
    if (!fs.existsSync(fixturePath)) {
      console.error(`Fixture file not found: ${fixturePath}`);
      process.exit(2);
    }

    const annotateRaw = JSON.parse(fs.readFileSync(annotatePath, 'utf8'));
    const fixtureRaw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    // normalize annotated tips (the server saved a wrapper { success:true, response: "JSON_STRING" })
    let annotatedTips = null;
    if (Array.isArray(annotateRaw)) {
      annotatedTips = annotateRaw;
    } else if (annotateRaw && typeof annotateRaw === 'object' && annotateRaw.response) {
      try {
        annotatedTips = JSON.parse(annotateRaw.response);
      } catch (e) {
        // fallback: try to parse raw string directly if it's already JSON-like
        annotatedTips = JSON.parse(annotateRaw.response.trim());
      }
    } else if (annotateRaw && Array.isArray(annotateRaw.data)) {
      annotatedTips = annotateRaw.data;
    } else {
      annotatedTips = annotateRaw;
    }

    // extract aiAnalysis from fixture file (the tmp file structure may wrap with success/data)
    let aiAnalysis = null;
    if (fixtureRaw && fixtureRaw.data && fixtureRaw.data.aiAnalysis) {
      aiAnalysis = fixtureRaw.data.aiAnalysis;
    } else if (fixtureRaw && fixtureRaw.aiAnalysis) {
      aiAnalysis = fixtureRaw.aiAnalysis;
    } else {
      // try to read analyze output file location fallback
      console.error('Could not locate aiAnalysis inside fixture file. Aborting.');
      process.exit(3);
    }

    // Build prediction object expected by databaseService.savePrediction
    const prediction = {
      probabilities: {
        homeWin: Number(aiAnalysis.probabilities?.homeWin) || 0,
        draw: Number(aiAnalysis.probabilities?.draw) || 0,
        awayWin: Number(aiAnalysis.probabilities?.awayWin) || 0
      },
      predictedScore: {
        home: Number(aiAnalysis.predictedScore?.home) || 0,
        away: Number(aiAnalysis.predictedScore?.away) || 0
      },
      confidence: aiAnalysis.confidence || 'unknown',
      keyFactors: aiAnalysis.keyFactors || [],
      bettingTips: annotatedTips || []
    };

    console.log('Initializing DB...');
    await databaseService.initialize();

    console.log('Saving prediction to DB for fixture:', fixtureId);
    const lastId = await databaseService.savePrediction(fixtureId, prediction);

    if (lastId) {
      console.log(`Saved prediction with row id: ${lastId}`);
      process.exit(0);
    } else {
      console.error('Save returned falsy id. Check database logs.');
      process.exit(4);
    }
  } catch (err) {
    console.error('Error saving annotated prediction:', err);
    process.exit(1);
  }
})();
