import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const artifact = JSON.parse(await readFile(new URL('artifacts/contracts/BlockConquest.sol/BlockConquest.json', root), 'utf8'));
await mkdir(new URL('frontend/src/generated/', root), { recursive: true });
await writeFile(new URL('frontend/src/generated/BlockConquest.json', root), JSON.stringify({ abi: artifact.abi }, null, 2) + '\n');
console.log('Exported the current BlockConquest ABI to the frontend.');
