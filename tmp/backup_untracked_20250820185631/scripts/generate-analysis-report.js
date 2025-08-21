import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';

(async function() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.join(__dirname, '..');
    const tmpDir = path.join(projectRoot, 'tmp_analysis_all');
    const dbPath = path.join(projectRoot, 'database', 'football_betting.db');
    const reportPath = path.join(projectRoot, 'tmp_analysis_report.json');

    if (!fs.existsSync(tmpDir)) {
      console.error('tmp_analysis_all directory not found:', tmpDir);
      process.exit(2);
    }
    if (!fs.existsSync(dbPath)) {
      console.error('Database file not found:', dbPath);
      process.exit(3);
    }

    const files = fs.readdirSync(tmpDir);
    const fileRe = /^tmp_analysis_(\d+)(_error)?\.json$/;

    const fixturesFromFiles = {};
    for (const f of files) {
      const m = f.match(fileRe);
      if (!m) continue;
      const fixtureId = Number(m[1]);
      const isError = !!m[2];
      if (!fixturesFromFiles[fixtureId]) fixturesFromFiles[fixtureId] = { files: [], hasErrorFile: false };
      fixturesFromFiles[fixtureId].files.push(f);
      fixturesFromFiles[fixtureId].hasErrorFile = fixturesFromFiles[fixtureId].hasErrorFile || isError;
    }

    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    // Get fixtures that have predictions in DB
    const rows = await db.all(`SELECT DISTINCT fixture_id FROM match_predictions`);
    const fixturesInDb = new Set(rows.map(r => r.fixture_id));

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalFiles: Object.keys(fixturesFromFiles).length,
        totalFixturesWithPredictionsInDb: fixturesInDb.size
      },
      fixtures: {}
    };

    // For each fixture present in files, gather DB info
    for (const fixtureIdStr of Object.keys(fixturesFromFiles)) {
      const fixtureId = Number(fixtureIdStr);
      const entry = fixturesFromFiles[fixtureId];
      const preds = await db.all(
        `SELECT id, prediction_hash, prediction_date, ai_model, predicted_home_score, predicted_away_score
         FROM match_predictions WHERE fixture_id = ? ORDER BY prediction_date DESC`,
        fixtureId
      );
      const results = await db.all(
        `SELECT id, home_score, away_score, result_date FROM match_results WHERE fixture_id = ? ORDER BY result_date DESC`,
        fixtureId
      );

      // Attempt to read the tmp file content (first non-error file)
      let tmpContent = null;
      const primaryFile = entry.files.find(fn => !fn.includes('_error')) || entry.files[0];
      try {
        const raw = fs.readFileSync(path.join(tmpDir, primaryFile), 'utf8');
        tmpContent = JSON.parse(raw);
      } catch (e) {
        tmpContent = { readError: e.message };
      }

      report.fixtures[fixtureId] = {
        fixtureId,
        files: entry.files,
        hasErrorFile: entry.hasErrorFile,
        tmpPrimaryFile: primaryFile,
        tmpContentSummary: tmpContent && typeof tmpContent === 'object' ? {
          keys: Object.keys(tmpContent).slice(0,20)
        } : tmpContent,
        db: {
          numPredictions: preds.length,
          latestPrediction: preds[0] || null,
          predictionsSample: preds.slice(0,5),
          hasResult: results.length > 0,
          latestResult: results[0] || null
        }
      };
    }

    // Also list fixtures that have predictions in DB but no tmp file
    const fixturesWithNoFile = [];
    for (const fid of fixturesInDb) {
      if (!fixturesFromFiles[fid]) fixturesWithNoFile.push(fid);
    }

    report.summary.missingFilesForDbFixtures = fixturesWithNoFile.length;
    report.missingFilesForDbFixtures = fixturesWithNoFile;

    // Fixtures that have tmp file but no DB prediction (candidates to re-run analysis)
    const fixturesFilesNoDb = [];
    for (const fidStr of Object.keys(fixturesFromFiles)) {
      const fid = Number(fidStr);
      const preds = await db.all(`SELECT id FROM match_predictions WHERE fixture_id = ?`, fid);
      if (!preds || preds.length === 0) fixturesFilesNoDb.push(fid);
    }
    report.summary.filesWithoutDbPredictions = fixturesFilesNoDb.length;
    report.filesWithoutDbPredictions = fixturesFilesNoDb;

    // Save report
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log('Report written to', reportPath);
    await db.close();
    process.exit(0);
  } catch (err) {
    console.error('Error generating analysis report:', err);
    process.exit(1);
  }
})();
