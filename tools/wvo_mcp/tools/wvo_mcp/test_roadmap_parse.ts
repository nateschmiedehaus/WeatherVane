import YAML from 'yaml';
import fs from 'fs';

const content = fs.readFileSync('../../state/roadmap.yaml', 'utf-8');
const roadmap = YAML.parse(content);

console.log("Roadmap structure:");
if (roadmap) {
  console.log("- Root type:", Array.isArray(roadmap) ? "Array" : typeof roadmap);
  if (!Array.isArray(roadmap)) {
    console.log("- Root keys:", Object.keys(roadmap));
  }
}

if (roadmap.epics) {
  console.log("- Epics count:", roadmap.epics.length);
}

if (roadmap.tasks) {
  console.log("- Root tasks count:", roadmap.tasks.length);
  roadmap.tasks.slice(0, 3).forEach((t, i) => console.log(`  [${i}] ${t.id} - ${t.status}`));
}

if (Array.isArray(roadmap)) {
  console.log("- Roadmap is array with", roadmap.length, "items");
  roadmap.slice(0, 3).forEach((item, i) => {
    console.log(`  [${i}] id=${item.id}, status=${item.status}`);
  });
}
