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

async function analyze() {
    const basePath = path.join(__dirname, '..', 'data', 'cis');
    const categories = ['generators', 'emergency_resource'];

    for (const category of categories) {
        const dir = path.join(basePath, category);
        const files = await scanDirectory(dir);
        
        let totalRows = 0;
        let validRows = 0;
        const uniqueIds = new Set<string>();

        for (const file of files) {
            await new Promise<void>((resolve) => {
                fs.createReadStream(file)
                    .pipe(csv())
                    .on('data', (row) => {
                        totalRows++;
                        if (row.place_id && row.latitude && row.longitude) {
                            validRows++;
                            uniqueIds.add(row.place_id);
                        }
                    })
                    .on('end', () => resolve());
            });
        }
        
        console.log(`\n--- Analysis for ${category} ---`);
        console.log(`Total CSV Files: ${files.length}`);
        console.log(`Total Data Rows (excluding headers): ${totalRows}`);
        console.log(`Valid Data Rows (has place_id, lat, lng): ${validRows}`);
        console.log(`Unique place_ids: ${uniqueIds.size}`);
        console.log(`Duplicates found: ${validRows - uniqueIds.size}`);
    }
}

analyze();
