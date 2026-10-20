import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
await mkdir(new URL('frontend/src/generated/', root), { recursive: true });
for (const name of ['BlockConquest', 'BlockConquestMatch']) {
  const artifact = JSON.parse(await readFile(new URL(`artifacts/contracts/${name}.sol/${name}.json`, root), 'utf8'));
  await writeFile(new URL(`frontend/src/generated/${name}.json`, root), JSON.stringify({ abi: artifact.abi }, null, 2) + '\n');
}
console.log('Exported the open-board and two-player match ABIs.');
