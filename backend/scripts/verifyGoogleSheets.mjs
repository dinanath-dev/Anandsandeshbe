import 'dotenv/config';
import { verifyGoogleSheetAccess } from '../utils/googleSheets.js';

const result = await verifyGoogleSheetAccess();
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
