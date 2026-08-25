import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

async function scanDirectory(dir: string, fileList: string[] = []): Promise<string[]> {
    if (!fs.existsSync(dir)) return fileList;
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = await fs.promises.stat(filePath);
        if (stat.isDirectory()) {
            await scanDirectory(filePath, fileList);
        } else if (file.endsWith('.csv')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

async function findDuplicates() {
    const basePath = path.join(__dirname, '..', 'data', 'cis', 'generators');
    const files = await scanDirectory(basePath);
    
    // Map to store place_id -> array of file paths
    const placeMap = new Map<string, string[]>();

    for (const file of files) {
        await new Promise<void>((resolve) => {
            fs.createReadStream(file)
                .pipe(csv())
                .on('data', (row) => {
                    if (row.place_id) {
                        const existing = placeMap.get(row.place_id) || [];
                        existing.push(file);
                        placeMap.set(row.place_id, existing);
                    }
                })
                .on('end', () => resolve());
        });
    }
    
    // Find first 3 place_ids that appear in multiple files
    let found = 0;
    for (const [placeId, paths] of placeMap.entries()) {
        if (paths.length > 1) {
            console.log(`\nDuplicate Place ID found: ${placeId}`);
            console.log(`Appears in ${paths.length} rows.`);
            
            // Show first 5 occurrences
            paths.slice(0, 5).forEach(p => console.log(`- ${path.basename(p)}`));
            
            found++;
            if (found >= 3) break;
        }
    }
}

findDuplicates();
