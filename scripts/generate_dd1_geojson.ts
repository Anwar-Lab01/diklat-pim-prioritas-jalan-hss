import { DD1SegmentGeometryService } from '../src/services/dd1SegmentGeometryService.ts';

console.log('================================================================');
console.log('GENERATING AUTHORITATIVE DD1 CONDITION SEGMENTS GEOJSON');
console.log('================================================================');

const service = new DD1SegmentGeometryService();
const t0 = performance.now();
const result = service.writeCanonicalGeoJsonFile();
const elapsed = performance.now() - t0;

console.log(`✓ GeoJSON File generated: ${result.filePath}`);
console.log(`✓ Total Features: ${result.totalSegments}`);
console.log(`✓ File Size: ${(result.byteSize / 1024 / 1024).toFixed(2)} MB (${result.byteSize} bytes)`);
console.log(`✓ Computation Time: ${elapsed.toFixed(2)} ms`);
console.log('================================================================');
