// Sprawdź ścieżkę do bazy danych
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Sprawdzanie ścieżek do bazy danych...\n');

const dbDir = path.join(__dirname, 'database');
const dbPath = path.join(dbDir, 'football_betting.db');

console.log('📁 Ścieżki:');
console.log(`  • __dirname: ${__dirname}`);
console.log(`  • dbDir: ${dbDir}`);
console.log(`  • dbPath: ${dbPath}`);

console.log('\\n📂 Sprawdzanie istnienia plików:');
console.log(`  • Folder database: ${fs.existsSync(dbDir) ? '✅' : '❌'}`);
console.log(`  • Plik bazy: ${fs.existsSync(dbPath) ? '✅' : '❌'}`);

if (fs.existsSync(dbPath)) {
  const stats = fs.statSync(dbPath);
  console.log(`  • Rozmiar pliku: ${stats.size} bajtów`);
  console.log(`  • Ostatnia modyfikacja: ${stats.mtime}`);
}

// Sprawdź też ścieżkę z services
const servicesDir = path.join(__dirname, 'src/services');
const serviceDbDir = path.join(servicesDir, '../../database');
const serviceDbPath = path.join(serviceDbDir, 'football_betting.db');

console.log('\\n📁 Ścieżki z services:');
console.log(`  • servicesDir: ${servicesDir}`);
console.log(`  • serviceDbDir: ${path.resolve(serviceDbDir)}`);
console.log(`  • serviceDbPath: ${path.resolve(serviceDbPath)}`);

console.log('\\n📂 Sprawdzanie istnienia (z services):');
console.log(`  • Folder database: ${fs.existsSync(path.resolve(serviceDbDir)) ? '✅' : '❌'}`);
console.log(`  • Plik bazy: ${fs.existsSync(path.resolve(serviceDbPath)) ? '✅' : '❌'}`);

if (fs.existsSync(path.resolve(serviceDbPath))) {
  const stats = fs.statSync(path.resolve(serviceDbPath));
  console.log(`  • Rozmiar pliku: ${stats.size} bajtów`);
  console.log(`  • Ostatnia modyfikacja: ${stats.mtime}`);
}

// Sprawdź czy to ten sam plik
const resolvedDbPath = path.resolve(dbPath);
const resolvedServiceDbPath = path.resolve(serviceDbPath);

console.log('\\n🔗 Porównanie ścieżek:');
console.log(`  • Główna: ${resolvedDbPath}`);
console.log(`  • Z services: ${resolvedServiceDbPath}`);
console.log(`  • Czy to ten sam plik: ${resolvedDbPath === resolvedServiceDbPath ? '✅' : '❌'}`);

console.log('\\n📋 Lista plików w folderze database:');
if (fs.existsSync(dbDir)) {
  const files = fs.readdirSync(dbDir);
  files.forEach(file => {
    const filePath = path.join(dbDir, file);
    const stats = fs.statSync(filePath);
    console.log(`  • ${file} (${stats.size} bajtów, ${stats.mtime})`);
  });
} else {
  console.log('  ❌ Folder database nie istnieje');
}